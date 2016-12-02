/* eslint-env node, mocha */
"use strict";

// Run Redis before running test:
// docker run --name testredis -d -p 6379:6379 redis
// And clean up after test:
// docker stop testredis && docker rm testredis

var Promise = require('bluebird');
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var expect = chai.expect;

var BlueGate = require('bluegate');
var Needle = Promise.promisifyAll(require('needle'), {multiArgs: true});

var _testPath = 0;
var testPath = function() {
  return '/test' + ++_testPath;
};

describe('BlueGate session', function() {
  var app;
  var url = 'http://localhost:3000';

  before(function() {
    app = new BlueGate({
      log: false
    });
    // app.error(function() { console.log(this.error); });
    require('./bluegate-session.js')(app, {});
    return app.listen(3000);
  });

  after(function() {
    return app.close();
  });

  it('adds a session parameter', function() {
    var path = testPath();
    var _session;
    app.process('GET ' + path, function(session) {
      _session = session;
      return {};
    });
    return Needle.getAsync(url + path).then(function() {
      expect(_session).to.be.an('object');
    });
  });

  it('will not set a cookie for empty sessions', function() {
    var path = testPath();
    app.process('GET ' + path, function(session) {
      // Do nothing.
      return {};
    });
    return Needle.getAsync(url + path).then(function(response) {
      expect(response[0].headers).to.not.have.property('set-cookie');
    });
  });

  it('will set a cookie when using session', function() {
    var path = testPath();
    app.process('GET ' + path, function(session) {
      session.set('foo', 'bar');
      return {};
    });
    return Needle.getAsync(url + path, {parse_cookies: true}).then(function(response) {
      expect(response[0].cookies).to.have.property('session');
    });
  });

  it('can remember session variable', function() {
    var path1 = testPath();
    var path2 = testPath();
    app.process('GET ' + path1, function(session) {
      session.set('foo', 'bar');
      return {};
    });
    app.process('GET ' + path2, function(session) {
      return {foo: session.get('foo', null)};
    });
    return Needle.getAsync(url + path1, {parse_cookies: true}).then(function(response) {
      return Needle.getAsync(url + path2, {cookies: response[0].cookies});
    }).then(function(response) {
      expect(response[1]).to.have.property('foo', 'bar');
    });
  });

  it('can delete session variable', function() {
    var path1 = testPath();
    var path2 = testPath();
    var path3 = testPath();
    app.process('GET ' + path1, function(session) {
      session.set('foo', 'bar');
      return {};
    });
    app.process('GET ' + path2, function(session) {
      session.del('foo');
      return {};
    });
    app.process('GET ' + path3, function(session) {
      return {foo: session.get('foo', null)};
    });
    var cookies;
    return Needle.getAsync(url + path1, {parse_cookies: true}).then(function(response) {
      cookies = response[0].cookies;
      return Needle.getAsync(url + path2, {cookies: cookies});
    }).then(function(response) {
      return Needle.getAsync(url + path3, {cookies: cookies});
    }).then(function(response) {
      expect(response[1]).to.not.have.property('foo', 'bar');
    });
  });

  it('can destroy session', function() {
    var path1 = testPath();
    var path2 = testPath();
    var path3 = testPath();
    app.process('GET ' + path1, function(session) {
      session.set('foo', 'bar');
      return {};
    });
    app.process('GET ' + path2, function(session) {
      session.destroy();
      return {};
    });
    app.process('GET ' + path3, function(session) {
      return {foo: session.get('foo', null)};
    });
    var cookies;
    return Needle.getAsync(url + path1, {parse_cookies: true}).then(function(response) {
      cookies = response[0].cookies;
      return Needle.getAsync(url + path2, {cookies: cookies});
    }).then(function(response) {
      return Needle.getAsync(url + path3, {cookies: cookies});
    }).then(function(response) {
      expect(response[1]).to.not.have.property('foo', 'bar');
    });
  });

  it('creates new session when using set after destroy', function() {
    var path1 = testPath();
    var path2 = testPath();
    var path3 = testPath();
    app.process('GET ' + path1, function(session) {
      session.set('foo', 'bar');
      return {};
    });
    app.process('GET ' + path2, function(session) {
      session.destroy();
      session.set('foo', 'bar');
      return {};
    });
    app.process('GET ' + path3, function(session) {
      return {foo: session.get('foo', null)};
    });
    var cookies;
    return Needle.getAsync(url + path1, {parse_cookies: true}).then(function(response) {
      cookies = response[0].cookies;
      return Needle.getAsync(url + path2, {cookies: cookies, parse_cookies: true});
    }).then(function(response) {
      // The session id should be changed now. Check if we got a new session id.
      expect(cookies.session).to.not.equal(response[0].cookies.session);
      cookies = response[0].cookies;
      return Needle.getAsync(url + path3, {cookies: cookies});
    }).then(function(response) {
      expect(response[1]).to.have.property('foo', 'bar');
    });
  });

  it('will delete cookie after destroy', function() {
    var path1 = testPath();
    var path2 = testPath();
    app.process('GET ' + path1, function(session) {
      session.set('foo', 'bar');
      return {};
    });
    app.process('GET ' + path2, function(session) {
      session.destroy();
      return {};
    });
    var cookies;
    return Needle.getAsync(url + path1, {parse_cookies: true}).then(function(response) {
      cookies = response[0].cookies;
      return Needle.getAsync(url + path2, {cookies: cookies, parse_cookies: true});
    }).then(function(response) {
      // Cookie should be empty.
      expect(response[0].cookies.session).to.equal('');
    });
  });

  it('will ignore unknown session id\'s', function() {
    var path = testPath();
    app.process('GET ' + path, function(session) {
      return {foo: session.get('foo', null)};
    });
    return Needle.getAsync(url + path, {cookies: {session: 'unknown'}}).then(function(response) {
      expect(response[1]).to.have.property('foo', null);
    });
  });

  it('is not enabled for static files', function() {
    var path = testPath() + '.jpg';
    var _session;
    app.process('GET ' + path, function(session) {
      _session = session;
      return {};
    });
    return Needle.getAsync(url + path).then(function() {
      expect(_session).to.not.be.an('object');
    });
  });

  it('can store session in error flow', function() {
    var path1 = testPath();
    var path2 = testPath();
    app.process('GET ' + path1, function(session) {
      session.set('foo', 'bar');
      throw new Error('go to error flow');
    });
    app.error('GET ' + path1, function(session) {
      return 'error page';
    });
    app.process('GET ' + path2, function(session) {
      return {foo: session.get('foo')};
    });
    var cookies;
    return Needle.getAsync(url + path1, {parse_cookies: true}).then(function(response) {
      cookies = response[0].cookies;
      expect(response[1]).to.equal('error page');
      return Needle.getAsync(url + path2, {cookies: cookies, parse_cookies: true});
    }).then(function(response) {
      expect(response[1]).to.have.property('foo', 'bar');
    });
  });

});
