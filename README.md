BlueGate Session
==================

Sssion support for BlueGate.

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
