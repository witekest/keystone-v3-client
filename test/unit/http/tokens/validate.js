var _ = require('lodash'),
  sinon = require('sinon'),
  should = require('should'),
  uris = require('../../../../lib/util/uris'),
  mocks = require('../../../util/mocks');

module.exports = function (settings) {
  var keystoneUrl = settings.url,
    keystoneToken = settings.token,
    tokensApiSettings = {
      url: keystoneUrl
    },
    tokensApi,
    api;

  return function () {

    beforeEach(function () {
      tokensApi = require('../../../../lib/keystone').tokens(tokensApiSettings);
      api = mocks.mockedKeystoneServer({
        url    : keystoneUrl,
        headers: {
          'X-Auth-Token'   : keystoneToken,
          'X-Subject-Token': keystoneToken
        }
      });
    });
    afterEach(function () {
      require('nock').cleanAll();
    });

    var dataFile = JSON.parse(require('fs')
        .readFileSync(__dirname + '/validate.json')
        .toString()),
      responseBody = dataFile.response,
      errorCodes = [400, 401, 403, 405, 413, 503, 404];

    it('should validate token correctly', function () {
      // set up
      var success = sinon.spy(),
        failure = sinon.spy();
      // set up

      // prepare server
      api.get(uris.tokens)
        .reply(200, responseBody);
      // prepare server

      tokensApi
        .validate({
          headers: {
            'X-Auth-Token'   : keystoneToken,
            'X-Subject-Token': keystoneToken
          }
        })
        .then(success, failure)
        .finally(function () {
          should(success.called).be.eql(true);
          should(failure.called).be.eql(false);

          should(success.calledWith({
            data      : responseBody,
            statusCode: 200
          })).be.eql(true);

          should(api.isDone()).be.eql(true);
        });
    });

    _.forEachRight(errorCodes, function (errorCode) {
      it('should fail for following code ' + errorCode, function () {
        var success = sinon.spy(),
          failure = sinon.spy(),
          responseBody = mocks.getResponseBodyForErrorCase(errorCode, 'Validate');

        var tmpApi = api.get(uris.tokens);
        if (errorCode / 500 >= 1.0) {
          tmpApi.replyWithError(JSON.stringify(responseBody));
        } else {
          tmpApi.reply(errorCode, JSON.stringify(responseBody));
        }

        tokensApi
          .validate({
            headers: {
              'X-Auth-Token'   : keystoneToken,
              'X-Subject-Token': keystoneToken
            }
          })
          .then(success, failure)
          .finally(function () {
            should(success.called).be.eql(false);
            should(failure.called).be.eql(true);

            should(failure.calledWith({
              data      : responseBody,
              statusCode: errorCode
            })).be.eql(true);

            should(api.isDone()).be.eql(true);
            require('nock').cleanAll();
          });
      });
    });
  };

};