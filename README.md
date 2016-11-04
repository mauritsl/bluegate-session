BlueGate Session
==================

[![Build Status](https://travis-ci.org/mauritsl/bluegate-session.svg?branch=master)](https://travis-ci.org/mauritsl/bluegate-session)
[![Coverage Status](https://coveralls.io/repos/mauritsl/bluegate-session/badge.svg?branch=master)](https://coveralls.io/r/mauritsl/bluegate-session?branch=master)
[![Dependency Status](https://david-dm.org/mauritsl/bluegate-session.svg)](https://david-dm.org/mauritsl/bluegate)

Sssion support for BlueGate using a Redis database.

## Installation

Install using ``npm install bluegate-session``

## Quick example

```javascript
var BlueGate = require('bluegate');

var app = new BlueGate();
app.listen(8080);

require('bluegate-session')(app, {
  database: 'redis://localhost',
  sessionExpires: 86400 * 30,
  cookieExpires: 0,
  cookieName: 'session'
});

app.process('GET /', function(session) {
  session.set('key', 'value');
  var value = session.get('key');
  session.destroy();
});
```
