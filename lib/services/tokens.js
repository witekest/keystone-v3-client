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

var Promise = require('bluebird'),
  _ = require('lodash'),
  servicesUtil = require('../util/services'),
  TokensApi = require('../keystone/tokens'),
  utils = require('../utils'),
  tokenCache;

/**
 * @module
 */
module.exports = TokenService;
tokenCache = module.exports.Cache = require('./tokens-cache');

utils.mixin(TokenService.prototype, {
  /**
   * Validates token.
   *
   * Token validation assumes checking if token has been already validated
   * (cache check) and returning immediately:
   * - true value if token is valid
   * - false value if token is not valid
   *
   * If token is not in cache request Keystone Identity to validate it.
   * Upon successful validation token will be cached.
   *
   * @param authToken master token to authenticate with API
   * @param subjectToken token to be evaluated
   * @returns {Promise}
   *
   * @static
   * @function
   */
  validateToken : _.wrap(validateToken, tokenWrapper),
  /**
   * Refreshes token.
   *
   * Returned promise returns new token only if token has been successfully
   * refreshed otherwise error will be passed as resolved value.
   *
   * Method will produce an error if token has not been validated/authenticated so far.
   * In order to react upon such situation use {@link Promise.catch}
   *
   * @param authToken master token to authenticate with API
   * @param subjectToken token to be evaulated
   * @returns {Promise}
   *
   * @static
   * @function
   */
  refreshToken  : _.wrap(refreshToken, tokenWrapper),
  /**
   * Evaluates if provided <b>token</b> has already expired.
   * Returns true if token has expired and false otherwise.
   *
   * Token expiration is described by 404 HTTP code thus only
   * for it this method will reject promise with true, otherwise
   * error cannot be handled here and will be throw. In order to get it
   * use {@link Promise#catch}.
   *
   * @param authToken master token to authenticate with API
   * @param subjectToken token to be evaulated
   * @returns {Promise} true (resolve)/false(reject), true if token is expired
   *
   * @static
   * @function
   */
  isTokenExpired: _.wrap(isTokenExpired, tokenWrapper)
});

function isTokenExpired(authToken, subjectToken) {
  return this.api
    .check({
      headers: tokensToHeader(authToken, subjectToken)
    })
    /*
     return true if expired, false otherwise
     if response code !== 404 [token expired] throw data as error
     */
    .then(handleNotExpired, handleExpired);

  function handleExpired(data) {
    var hasExpired = [404].indexOf(data.statusCode) > -1;
    if (hasExpired) {
      tokenCache.del(subjectToken);
    } else {
      // if not ok code and not 404, we cannot handle it, so throw error
      // data is sure to be an error here
      throw data;
    }
    return hasExpired;
  }

  function handleNotExpired() {
    return false;
  }
}

function refreshToken(token) {
  var tokenData;

  if (!(tokenData = tokenCache.get(token))) {
    // token has not been validated or authenticated
    return Promise.reject(new Error('Cannot refresh token ' + token +
      ', either validate or authenticate it first'));
  }

  return doRefreshToken.bind(this)(token, tokenData);

  function doRefreshToken(token) {
    return this.api
      .authenticate({
        data   : {
          'auth': {
            'identity': {
              'methods': ['token'],
              'token'  : token
            }
          }
        },
        headers: tokensToHeader(token, token)
      })
      .then(tokenRefreshed, _.identity /*pass along error*/);

    function tokenRefreshed(data) {
      // new token passed in header
      var newToken = data.headers['X-Subject-Token'],
        tokenData = data.data.token;

      tokenCache.del(token);
      tokenCache.put(newToken, tokenData, refreshToken.bind(this));

      return newToken;
    }
  }
}

function validateToken(authToken, subjectToken) {
  var self = this,
    tokenOKFn = _.constant({
      token: subjectToken,
      valid: true
    }),
    tokenNotOkFN = _.constant({
      token: subjectToken,
      valid: false
    });

  if (tokenCache.has(subjectToken)) {
    // token has been removed already from cache at this point
    return isTokenExpired
      .bind(self)(authToken, subjectToken)
      .then(tokenNotOkFN, tokenOKFn)
      .error(tokenNotOkFN);
    // use tokenNotOkFN for error from isTokenExpired if subjectToken
    // has been validated so far
    // do not try fefresh token here
  }

  return self.api
    .validate({
      headers: tokensToHeader(authToken, subjectToken)
    })
    .then(cacheTokenWrapper(subjectToken).bind(self)) // cache on success
    .then(tokenOKFn, tokenNotOkFN);

}

function TokenService(settings) {
  if (!(this instanceof TokenService)) {
    return new TokenService(settings);
  }

  this.api = servicesUtil.getApi(TokensApi, settings);
  this.settings = settings;

  tokenCache = tokenCache(settings); // init token cache if not yet ready
}

// utils
function tokensToHeader(authToken, subjectToken) {
  return {
    'X-Auth-Token'   : authToken,
    'X-Subject-Token': subjectToken
  };
}

// wrappers
function tokenWrapper(fn, authToken, subjectToken) {
  if (!subjectToken) {
    subjectToken = authToken;
  }
  return fn.call(this, authToken, subjectToken);
}

// put token in cache
function cacheTokenWrapper(token) {
  return function (data) {
    tokenCache.put(token, data.data.token, refreshToken.bind(this));
    return data;
  };
}
