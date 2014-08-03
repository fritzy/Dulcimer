var verymodel  = require('verymodel');
var Padlock    = require('padlock').Padlock;
var underscore = require('underscore');
var indexes    = require('./lib/indexes');
var importexport = require ('./lib/importexport');
var base       = require('./lib/base');
var children   = require('./lib/children');
var foreign    = require('./lib/foreign');
var uuid       = require('uuid-v4');
var LevelDulcimer = require('level-dulcimer');
var RiakDulcimer = require('riak-dulcimer');
var util = require('util');

var model_cache = {};

function getModel(name) {
    if (typeof name === 'string') {
        return model_cache[name];
    }
    return name;
}

var default_db = null;
var default_bucket = 'default';

function makeModelLevely(mf) {
    mf.options.savelock = new Padlock();

    mf.runWithLock = function (callback) {
        mf.options.savelock.runwithlock(callback, [mf.options.savelock.release.bind(mf.options.savelock)]);
    };

    mf.connect = function (opts) {
        if (typeof opts === 'string') {
            opts = {path: opts, type: 'level'};
        }
        if (typeof opts.type === 'undefined' || opts.type === 'level') {
            mf.options.db = LevelDulcimer(opts.path);
        } else if (opts.type === 'riak') {
            mf.options.db = RiakDulcimer(util.format("riak://%s:%d/%s", opts.host, opts.port, opts.bucket || default_bucket || 'default'));
        } else {
            throw Error("Invalid DB Specification");
        }
        return mf.options.db;
    };

    if (typeof mf.options.name !== 'string') {
        throw new Error("Model factories must include a name option.");
    }

    model_cache[mf.options.name] = mf;

    if (!mf.options.hasOwnProperty('foreignDepth')) {
        mf.options.foreignDepth = 5;
    }

    if ((mf.options.keyType === 'uuid' || typeof mf.options.keyType === 'undefined') && typeof mf.options.keyGenerator === 'undefined') {
        mf.options.keyGenerator = function (cb) {
            cb(false, uuid());
        };
    }

    mf.addDefinition({
        key: {
            private: true,
        },
        vclock: {
            private: true,
            save: false,
        },
        bucket: {
            private: true,
            save: false,
        },
    });

    mf.getModel = getModel;

    mf.handleOpts = function (name, opts, callback) {
        if (typeof callback === 'undefined') {
            opts = {cb: opts};
        } else {
            opts.cb = callback;
        }
        if (!opts.db && !mf.options.db && default_db !== null && mf.options.useGlobalDB !== false) {
            mf.options.db = default_db;
            opts.db = default_db;
        }
        if (!opts.db) {
            opts.db = mf.options.db;
        }
        if (!opts.bucket) {
            opts.bucket = mf.options.bucket || default_bucket;
        }
        if (typeof opts.cb !== 'function') {
            throw Error('The last argument in ' + name + ' must be a function');
        }
        if (!opts.db) {
            throw new Error("Model factories must include a db option of a levelup instance with valueEncoding of json.");
        }
        if (typeof opts.depth === 'undefined') {
            opts.depth = mf.options.foreignDepth;
        }
        opts.prefix = opts.prefix || mf.options.name;
        return opts;
    };

    indexes(mf);
    base(mf);
    children(mf);
    foreign(mf);
    importexport(mf);
    
    return mf;
}

function VeryLevelModel() {
    verymodel.VeryModel.apply(this, arguments);
    makeModelLevely(this);
}

VeryLevelModel.prototype = Object.create(verymodel.VeryModel.prototype);

module.exports = {
    Model: VeryLevelModel,
    
    connect: function (opts) {
        if (typeof opts === 'string') {
            opts = {path: opts, type: 'level'};
        }
        if (typeof opts.type === 'undefined' || opts.type === 'level') {
            default_db = LevelDulcimer(opts.path);
        } else if (opts.type === 'riak') {
            default_db = RiakDulcimer(util.format("riak://%s:%d/%s", opts.host, opts.port, opts.bucket || 'default'));
        } else {
            throw Error("Invalid DB Specification");
        }
        if (opts.bucket) {
            default_bucket = opts.bucket;
        }
        return default_db;
    },
    getModel: getModel,
};
