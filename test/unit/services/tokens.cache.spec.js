/*
 * Copyright 2015 FUJITSU LIMITED
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */

var sinon = require('sinon'),
  should = require('should'),
  _ = require('lodash'),
  proxyquire = require('proxyquire');

describe('tokensCache::service', function () {

  context('singleton with init', function () {
    var tokensCache;

    beforeEach(function () {
      tokensCache = require('../../../lib/services/tokens-cache');
    });

    it('should be factory function before init', function () {
      should(tokensCache).be.type('function');
    });

    it('should return object with API after init', function () {
      var initialized = tokensCache(),
        afterInitTC;

      should(initialized).be.type('object')
        .and
        .have.keys(['get', 'has', 'put', 'del']);

      should(initialized.get).be.type('function');
      should(initialized.has).be.type('function');
      should(initialized.put).be.type('function');

      afterInitTC = require('../../../lib/services/tokens-cache');
      should(afterInitTC).be.type('function'); // should be function too
    });
  });

  context('caching disabled', function () {
    var tokensCache,
      opts = {
        tokensCache: {
          cache: false // this is default
        }
      },
      memoryCache = {
        put: sinon.spy(),
        get: sinon.spy()
      };

    beforeEach(function () {
      tokensCache = proxyquire('../../../lib/services/tokens-cache', {
        'memory-cache': memoryCache
      });
      tokensCache = tokensCache(opts);
    });

    it('should not call memory-cache.put for tokensCache.put', function () {
      tokensCache.put();
      should(memoryCache.put.called).be.not.eql(true);
    });

    it('should not call memory-cache.get for tokensCache.has', function () {
      tokensCache.has();
      should(memoryCache.get.called).be.not.eql(true);
    });

    it('should not call memory-cache.get for tokensCache.get', function () {
      tokensCache.get();
      should(memoryCache.get.called).be.not.eql(true);
    });

  });

  context('caching enabled', function () {
    var tokensCache,
      memoryCache,
      opts = {
        tokensCache: {
          ttl  : 5,
          cache: true // this is default
        }
      };

    it('should call memory-cache.put for tokensCache.put', function () {
      var token = '3122142142121',
        data = {},
        defaultTTL = opts.tokensCache.ttl;

      memoryCache = {
        put: sinon.spy(),
        get: sinon.spy()
      };
      tokensCache = proxyquire('../../../lib/services/tokens-cache', {
        'memory-cache': memoryCache
      })(opts);

      tokensCache.put(token, data);

      should(memoryCache.put.called).be.eql(true);
      should(memoryCache.put.calledWith(token, data, defaultTTL)).be.eql(true);
    });

    _.forEach([false, true], function (expectedHasData) {
      it('should call memory-cache.get for tokensCache.has which returns ' + expectedHasData, function () {
        var token = '3122142142121',
          hasData;
        memoryCache = {
          put: sinon.spy(),
          get: sinon.stub().returns(expectedHasData ? {} : undefined)
        };
        tokensCache = proxyquire('../../../lib/services/tokens-cache', {
          'memory-cache': memoryCache
        })(opts);

        hasData = tokensCache.has(token);

        should(memoryCache.get.called).be.eql(true);
        should(memoryCache.get.calledWith(token)).be.eql(true);

        should(hasData).be.eql(expectedHasData);
      });
    });

    it('should call memory-cache.get for tokensCache.get', function () {
      var token = '3122142142121',
        retrievedData,
        data = {};

      memoryCache = {
        put: sinon.spy(),
        get: sinon.stub().returns(data)
      };
      tokensCache = proxyquire('../../../lib/services/tokens-cache', {
        'memory-cache': memoryCache
      })(opts);

      retrievedData = tokensCache.get(token);

      should(memoryCache.get.called).be.eql(true);
      should(memoryCache.get.calledWith(token)).be.eql(true);

      should(retrievedData).be.eql(data);
    });
  });

  context('expires_at [caching enabled]', function(){
    var tokensCache,
        memoryCache,
        utilsSpied,
        opts = {
          tokensCache: {
            ttl  : 5,
            cache: true // this is default
          }
        };

    beforeEach(function(){
      var utils = require('../../../lib/utils');

      utilsSpied = {
        parseISO8601Date: sinon.spy(utils.parseISO8601Date),
        dateDiff: sinon.spy(utils.dateDiff)
      }

    });

    it('should use calculated ttl for expires_in', function (done) {
      var token = '3122142142121',
          isoDateToday = new Date().toISOString(),
          data = {
            'expires_at': isoDateToday
          };

      memoryCache = {
        put: sinon.spy()
      };
      tokensCache = proxyquire('../../../lib/services/tokens-cache', {
        'memory-cache': memoryCache,
        '../utils'    : utilsSpied
      })(opts);

      setTimeout(function () {

        tokensCache.put(token, data);

        should(memoryCache.put.called).be.eql(true);
        should(utilsSpied.parseISO8601Date.calledWith(isoDateToday)).be.eql(true);
        should(utilsSpied.dateDiff.called).be.eql(true);

        done();

      }, 100);
    })
  });

});
