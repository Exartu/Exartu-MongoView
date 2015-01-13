Package.describe({
  summary: "view for mongo",
  name: 'aida:pagination',
  version: "0.1.0",
  git: "https://github.com/Exartu/Exartu-MongoView.git"
});

Package.onUse(function (api, where) {
  api.use(['underscore'],'server');

  api.addFiles(['server.js'], 'server');
  api.export('View', 'server');
});

