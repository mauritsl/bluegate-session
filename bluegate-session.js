"use strict";

var _ = require('lodash');
var Redis = require('redis');
var Promise = require('bluebird');
var Crypto = require('crypto');

Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

var Session = function(id, redisClient, expires) {
  this._id = id;
  this._redis = redisClient;
  this._expires = expires;
  this._changed = false;
  this._empty = true;
  this._data = {};
};

Session.prototype.getId = function() {
  return this._id;
};

Session.prototype.get = function(name, defaultValue) {
  if (this.has(name)) {
    return this._data[name];
  }
  else {
    return defaultValue;
  }
};

Session.prototype.set = function(name, value) {
  this._changed = true;
  this._empty = false;
  this._data[name] = value;
};

Session.prototype.has = function(name) {
  return typeof this._data[name] !== 'undefined';
};

Session.prototype.del = function(name) {
  if (this.has(name)) {
    delete this._data[name];
    this._changed = true;
    this._empty = !Object.keys(this._data).length;
  }
};

Session.prototype.changed = function() {
  return this._changed;
};

Session.prototype.empty = function() {
  return this._empty;
};

Session.prototype.save = function() {
  return this._redis.setexAsync('session:' + this._id, this._expires, JSON.stringify(this._data)).then(function() {
    // Discard results.
    return null;
  });
};

Session.prototype.load = function() {
  var self = this;
  return this._redis.getAsync('session:' + this._id).then(function(data) {
    if (data !== null) {
      self._data = JSON.parse(data);
      self._empty = !Object.keys(self._data).length;
    }
  });
};

Session.prototype.destroy = function() {
  this._data = {};
  this._changed = true;
  this._empty = true;

  // Delete the old session in the background.
  this._redis.delAsync('session:' + this._id);

  // And generate a new session id.
  this._id = Crypto.randomBytes(16).toString('base64');
};

var match = function(pattern, path) {
  if (typeof pattern === 'boolean') {
    return pattern;
  }
  if (pattern instanceof RegExp) {
    return !!path.match(pattern);
  }
};

module.exports = function(app, options) {
  options = _.defaults(options, {
    database: 'redis://localhost',
    sessionExpires: 86400,
    cookieExpires: 0,
    cookieName: 'session',
    enable: true,
    disable: /\.(css|js|jpg|png|gif|svg|txt|pdf|xls|doc|docx|zip|tar|gz|xml)$/
  });

  var redisClient = Redis.createClient(options.database);

  // Wrap the close function to close the redis client as well.
  var closeFunction = app.close;
  app.close = function() {
    redisClient.quit();
    return closeFunction.apply(app);
  };

  app.initialize(function() {
    // Check if sessions are disabled (not whitelisted or blacklisted) for this path.
    if (!match(options.enable, this.path) || match(options.disable, this.path)) {
      return;
    }

    var sessionId = this.getCookie(options.cookieName, 'alphanum');
    var exists = sessionId !== null;
    if (!exists) {
      sessionId = Crypto.randomBytes(16).toString('base64');
    }
    var session = new Session(sessionId, redisClient, options.sessionExpires);
    this.setParameter('session', session);
    if (exists) {
      return session.load();
    }
  });

  app.postprocess(function(session) {
    if (session instanceof Session && session.changed()) {
      // Set cookie if not already set or if session id changed.
      if (this.getCookie(options.cookieName, 'alphanum') !== session.getId()) {
        var expire;
        var value;
        if (session.empty()) {
          value = '';
        }
        else {
          if (options.cookieExpires) {
            expire = new Date();
            expire.setSeconds(expire.getSeconds() + options.cookieExpires);
          }
          value = session.getId();
        }
        this.setCookie(options.cookieName, value, expire, '/');
      }
      // Save session.
      return session.save();
    }
  });
};
