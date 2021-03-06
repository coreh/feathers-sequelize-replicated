'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.default = init;

var _lodash = require('lodash.omit');

var _lodash2 = _interopRequireDefault(_lodash);

var _uberproto = require('uberproto');

var _uberproto2 = _interopRequireDefault(_uberproto);

var _feathersQueryFilters = require('feathers-query-filters');

var _feathersQueryFilters2 = _interopRequireDefault(_feathersQueryFilters);

var _feathersErrors = require('feathers-errors');

var _feathersErrors2 = _interopRequireDefault(_feathersErrors);

var _feathersCommons = require('feathers-commons');

var _utils = require('./utils');

var utils = _interopRequireWildcard(_utils);

var _sequelize = require('sequelize');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Service = function () {
  function Service(options) {
    _classCallCheck(this, Service);

    if (!options) {
      throw new Error('Sequelize options have to be provided');
    }

    if (!options.model) {
      throw new Error('You must provide a Sequelize model name');
    }

    if (!options.master) {
      throw new Error('You must provide a Sequelize master instance');
    }

    this.paginate = options.paginate || {};
    this.model = options.model;
    this.master = options.master;
    this.replicas = options.replicas;
    this.id = options.id || 'id';
    this.events = options.events;
    this.raw = options.raw !== false;
  }

  _createClass(Service, [{
    key: 'decideServer',
    value: function decideServer(method, params) {
      if (!params.forceMaster && this.replicas && this.replicas.length > 0 && (method === 'find' || method === 'get')) {
        // Read queries go to replicas
        return this.replicas[Math.floor(Math.random() * this.replicas.length)];
      } else {
        // Write queries go to master
        return this.master;
      }
    }
  }, {
    key: 'computeSequelizeParam',
    value: function computeSequelizeParam(sequelize, server) {
      if (typeof sequelize === 'function') {
        return sequelize(server);
      }
      return sequelize || {};
    }
  }, {
    key: 'applyScope',
    value: function applyScope(params, server) {
      var Model = void 0;

      var sequelize = this.computeSequelizeParam(params.sequelize, server);

      Model = server.model(this.model);

      if (sequelize.scope) {
        return Model.scope(sequelize.scope);
      }

      return Model;
    }
  }, {
    key: 'extend',
    value: function extend(obj) {
      return _uberproto2.default.extend(obj, this);
    }
  }, {
    key: '_find',
    value: function _find(params) {
      var getFilter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _feathersQueryFilters2.default;

      var server = this.decideServer('find', params);

      var _getFilter = getFilter(params.query || {}),
          filters = _getFilter.filters,
          query = _getFilter.query;

      var where = utils.getWhere(query);
      var order = utils.getOrder(filters.$sort);

      var q = _extends({
        where: where,
        order: order,
        limit: filters.$limit,
        offset: filters.$skip,
        raw: this.raw
      }, this.computeSequelizeParam(params.sequelize, server));

      if (filters.$select) {
        q.attributes = filters.$select;
      }

      var Model = this.applyScope(params, server);

      return Model.findAndCount(q).then(function (result) {
        return {
          total: result.count,
          limit: filters.$limit,
          skip: filters.$skip || 0,
          data: result.rows
        };
      }).catch(utils.errorHandler);
    }
  }, {
    key: 'find',
    value: function find(params) {
      var paginate = params && typeof params.paginate !== 'undefined' ? params.paginate : this.paginate;
      var result = this._find(params, function (where) {
        return (0, _feathersQueryFilters2.default)(where, paginate);
      });

      if (!paginate.default) {
        return result.then(function (page) {
          return page.data;
        });
      }

      return result;
    }
  }, {
    key: '_get',
    value: function _get(id, params) {
      var server = this.decideServer('get', params);
      var where = utils.getWhere(params.query);

      // Attach 'where' constraints, if any were used.
      var q = _extends({
        raw: this.raw,
        where: _extends(_defineProperty({}, this.id, id), where)
      }, this.computeSequelizeParam(params.sequelize, server));

      var Model = this.applyScope(params, server);

      // findById calls findAll under the hood. We use findAll so that
      // eager loading can be used without a separate code path.
      return Model.findAll(q).then(function (result) {
        if (result.length === 0) {
          throw new _feathersErrors2.default.NotFound('No record found for id \'' + id + '\'');
        }

        return result[0];
      }).then((0, _feathersCommons.select)(params, this.id)).catch(utils.errorHandler);
    }

    // returns either the model intance for an id or all unpaginated
    // items for `params` if id is null

  }, {
    key: '_getOrFind',
    value: function _getOrFind(id, params) {
      if (id === null) {
        return this._find(params).then(function (page) {
          return page.data;
        });
      }

      return this._get(id, params);
    }
  }, {
    key: 'get',
    value: function get(id, params) {
      return this._get(id, params).then((0, _feathersCommons.select)(params, this.id));
    }
  }, {
    key: 'create',
    value: function create(data, params) {
      var _this = this;

      var server = this.decideServer('create', params);
      var options = _extends({ raw: this.raw }, this.computeSequelizeParam(params.sequelize, server));
      // Model.create's `raw` option is different from other methods.
      // In order to use `raw` consistently to serialize the result,
      // we need to shadow the Model.create use of raw, which we provide
      // access to by specifying `ignoreSetters`.
      var ignoreSetters = Boolean(options.ignoreSetters);
      var createOptions = _extends({}, options, { raw: ignoreSetters });
      var isArray = Array.isArray(data);
      var promise = void 0;

      var Model = this.applyScope(params, server);

      if (isArray) {
        promise = Model.bulkCreate(data, createOptions);
      } else {
        promise = Model.create(data, createOptions);
      }

      return promise.then(function (result) {
        var sel = (0, _feathersCommons.select)(params, _this.id);
        if (options.raw === false) {
          return result;
        }
        if (isArray) {
          return result.map(function (item) {
            return sel(item.toJSON());
          });
        }
        return sel(result.toJSON());
      }).catch(utils.errorHandler);
    }
  }, {
    key: '_patch',
    value: function _patch(id, data, params) {
      var server = this.decideServer('patch', params);
      var options = _extends({ raw: this.raw }, this.computeSequelizeParam(params.sequelize, server));

      if (Array.isArray(data)) {
        return Promise.reject(new _feathersErrors2.default.BadRequest('Not replacing multiple records.'));
      }

      var Model = this.applyScope(params, server);

      // Force the {raw: false} option as the instance is needed to properly
      // update
      return Model.findById(id, { raw: false }).then(function (instance) {
        if (!instance) {
          throw new _feathersErrors2.default.NotFound('No record found for id \'' + id + '\'');
        }

        return instance.update(data, { raw: false }).then(function (instance) {
          if (options.raw === false) {
            return instance;
          }
          return instance.toJSON();
        });
      }).then((0, _feathersCommons.select)(params, this.id)).catch(utils.errorHandler);
    }
  }, {
    key: 'patch',
    value: function patch(id, data, params) {
      var _this2 = this;

      var server = this.decideServer('patch', params);
      var where = _extends({}, (0, _feathersQueryFilters2.default)(params.query || {}).query);
      var mapIds = function mapIds(page) {
        return page.data.map(function (current) {
          return current[_this2.id];
        });
      };

      if (id !== null) {
        // single instance
        return this._patch(id, data, params);
      }

      var options = _extends({}, this.computeSequelizeParam(params.sequelize, server), { where: where });

      var Model = this.applyScope(params, server);

      // This is the best way to implement patch in sql, the other dialects 'should' use a transaction.
      if (Model.sequelize.options.dialect === 'postgres') {
        options.returning = true;
        return Model.update((0, _lodash2.default)(data, this.id), options).then(function (results) {
          if (id === null) {
            return results[1];
          }

          if (!results[1].length) {
            throw new _feathersErrors2.default.NotFound('No record found for id \'' + id + '\'');
          }

          return results[1][0];
        }).then((0, _feathersCommons.select)(params, this.id)).catch(utils.errorHandler);
      }

      // By default we will just query for the one id. For multi patch
      // we create a list of the ids of all items that will be changed
      // to re-query them after the update
      var ids = id === null ? this._find(params).then(mapIds) : Promise.resolve([id]);

      return ids.then(function (idList) {
        // Create a new query that re-queries all ids that
        // were originally changed
        var findParams = _extends({}, params, {
          query: _defineProperty({}, _this2.id, _defineProperty({}, _sequelize.Op.in, idList))
        });

        return Model.update((0, _lodash2.default)(data, _this2.id), options).then(function () {
          return _this2._getOrFind(id, findParams);
        });
      }).then((0, _feathersCommons.select)(params, this.id)).catch(utils.errorHandler);
    }
  }, {
    key: 'update',
    value: function update(id, data, params) {
      var server = this.decideServer('update', params);
      var options = _extends({ raw: this.raw }, this.computeSequelizeParam(params.sequelize, server));

      if (Array.isArray(data)) {
        return Promise.reject(new _feathersErrors2.default.BadRequest('Not replacing multiple records. Did you mean `patch`?'));
      }

      var Model = this.applyScope(params, server);

      // Force the {raw: false} option as the instance is needed to properly
      // update
      return Model.findById(id, { raw: false }).then(function (instance) {
        if (!instance) {
          throw new _feathersErrors2.default.NotFound('No record found for id \'' + id + '\'');
        }

        var copy = {};
        Object.keys(instance.toJSON()).forEach(function (key) {
          if (typeof data[key] === 'undefined') {
            copy[key] = null;
          } else {
            copy[key] = data[key];
          }
        });

        return instance.update(copy, { raw: false }).then(function (instance) {
          if (options.raw === false) {
            return instance;
          }
          return instance.toJSON();
        });
      }).then((0, _feathersCommons.select)(params, this.id)).catch(utils.errorHandler);
    }
  }, {
    key: 'remove',
    value: function remove(id, params) {
      var _this3 = this;

      var server = this.decideServer('remove', params);
      var opts = _extends({ raw: this.raw }, params);
      return this._getOrFind(id, opts).then(function (data) {
        var where = _extends({}, (0, _feathersQueryFilters2.default)(params.query || {}).query);

        if (id !== null) {
          where[_this3.id] = id;
        }

        var options = _extends({}, _this3.computeSequelizeParam(params.sequelize, server), { where: where });

        var Model = _this3.applyScope(params, server);

        return Model.destroy(options).then(function () {
          return data;
        });
      }).then((0, _feathersCommons.select)(params, this.id)).catch(utils.errorHandler);
    }
  }]);

  return Service;
}();

function init(options) {
  return new Service(options);
}

init.Service = Service;
module.exports = exports['default'];