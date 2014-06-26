var verymodel  = require('verymodel');
var Padlock    = require('padlock').Padlock;
var keylib     = require('./lib/keys');
var underscore = require('underscore');
var getDBPath  = require('./lib/dbpool');
var indexes    = require('./lib/indexes');
var base       = require('./lib/base');
var children   = require('./lib/children');
var foreign    = require('./lib/foreign');
var uuid       = require('uuid-v4');
var LevelDulcimer = require('level-dulcimer');

var model_cache = {};

function makeModelLevely(mf) {
    mf.options.savelock = new Padlock();

    mf.runWithLock = function (callback) {
        mf.options.savelock.runwithlock(callback, [mf.options.savelock.release.bind(mf.options.savelock)]);
    };

    mf.connectLevelPath = function (path) {
        this.options.db = LevelDulcimer(path);
    };

    if (typeof mf.options.name !== 'string') {
        throw new Error("Model factories must include a name option.");
    }

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

    mf.handleOpts = function (name, opts, callback) {
        if (typeof callback === 'undefined') {
            opts = {cb: opts};
        } else {
            opts.cb = callback;
        }
        if (!opts.db) {
            opts.db = mf.options.db;
        }
        if (!opts.bucket) {
            opts.bucket = mf.options.bucket || 'default';
        }
        if (typeof opts.cb !== 'function') {
            throw Error('The last argument in ' + name + 'must be a function');
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
    
    mf.bucket = function (bucket) {
        var opts = underscore.clone(mf.options);
        opts.bucket = bucket;
        return new VeryLevelModel(mf.definition, opts);
    };

    return mf;
}


function VeryLevelModel() {
    verymodel.VeryModel.apply(this, arguments);
    makeModelLevely(this);
}

VeryLevelModel.prototype = Object.create(verymodel.VeryModel.prototype);

module.exports = {
    Model: VeryLevelModel,
};
