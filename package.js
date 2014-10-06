Package.describe({
  summary: "view for mongo",
  name: 'mongoview'
});

Package.onUse(function (api, where) {
  api.use(['underscore'],'server');

  api.addFiles(['server.js'], 'server');
  api.export('View', 'server');
});

