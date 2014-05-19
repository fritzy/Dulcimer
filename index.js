var verymodel  = require('verymodel');
var Padlock    = require('padlock').Padlock;
var keylib     = require('./lib/keys');
var underscore = require('underscore');
var getDBPath  = require('./lib/dbpool');
var indexes    = require('./lib/indexes');
var base       = require('./lib/base');
var children   = require('./lib/children');
var foreign    = require('./lib/foreign');

var model_cache = {};

function makeModelLevely(mf) {
    mf.options.savelock = new Padlock();

    mf.getBucketDB = function (bucket) {
        if (mf.options.dbdir.substr(-1) !== '/') {
            mf.options.dbdir += '/';
        }
        return getDBPath(mf.options.dbdir + bucket + '.db');
    };

    if (mf.options.dbdir) {
        mf.options.db = mf.getBucketDB(mf.options.bucket || 'defaultbucket');
    }

    //for historical reasons, support prefix and name
    if (!mf.options.name) {
        mf.options.name = mf.options.prefix;
    }

    if (typeof mf.options.name !== 'string') {
        throw new Error("Model factories must include a prefix option.");
    }

    if (!mf.options.hasOwnProperty('foreignDepth')) {
        mf.options.foreignDepth = 5;
    }

    mf.addDefinition({
        key: {
            derive: function () {
                var value;
                if (this.__verymeta.data.key) return this.__verymeta.data.key;
                if (this.__verymeta.parent) {
                    value = keylib.joinChild(mf, keylib.joinSep(mf, ('__child__', this.__verymeta.parent.key)), this.__verymeta.prefix, undefined);
                } else {
                    value = this.__verymeta.prefix + (this.__verymeta.sep || '!');
                }
                if (!this.keyname) {
                    return '';
                }
                value += this.keyname;
                return value;
            },
            private: !mf.options.includeKey,
        },
        keyname: {
            private: !mf.options.includeKey,
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
        if (opts.bucket && mf.options.dbdir) {
            opts.db = mf.getBucketDB(opts.bucket);
        } else if (!opts.db) {
            opts.db = mf.options.db;
        }
        if (opts.db.isRiak && !opts.bucket) {
            opts.bucket = mf.options.bucket || 'default';
        }
        if (typeof opts.cb !== 'function') {
            throw Error('The last argument in ' + name + 'must be a function');
        }
        if (!opts.db) {
            throw new Error("Model factories must include a db option of a levelup instance with valueEncoding of json.");
        }
        if (opts.db.isClosed() && !opts.bucket.isRiak) {
            mf.options.db = opts.db = mf.getBucketDB(mf.options.bucket || 'defaultbucket');
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
