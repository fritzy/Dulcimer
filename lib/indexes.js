var keylib = require('./keys');
var async = require('async');
var increment = require('./increment');

module.exports = function (mf) {
    mf.options.bin_indexes = [];
    mf.options.int_indexes = [];
    
    (function () {
        var def_fields = Object.keys(mf.definition);
        var newdef, def, field;
        for (var fidx in def_fields) {
            def = mf.definition[def_fields[fidx]];
            field = def_fields[fidx];
            if (def.index === true) {
                if (def.type === 'integer') {
                    mf.options.int_indexes.push(field);
                    def.index_int = true;
                } else {
                    mf.options.bin_indexes.push(field);
                }
            } else if (def.index_int === true) {
                mf.options.int_indexes.push(field);
            }
        }
    })();
    
    mf.getIndexTotal = function (field, value, opts, callback) {
        opts = mf.handleOpts('Factory.getIndexTotal', opts, callback);
        if (mf.definition[field].index_int) {
            field += '_int';
        } else {
            field += '_bin';
        }
        opts.db.getIndexValueTotal(field, value, {bucket: opts.bucket}, opts.cb);
    };

    mf.allSortByIndex = function (field, opts, callback) {
        opts = mf.handleOpts('Factory.allSortByIndex', opts, callback);
        opts.sortBy = field;
        mf.all(opts, opts.cb);
    };

    mf.getByIndex = function (field, value, opts, callback) {
        opts = mf.handleOpts('Factory.getByIndex', opts, callback);
        opts.index = field;
        opts.indexValue = value;
        mf.all(opts, opts.cb);
    };
    
    mf.findByIndex = function (field, value, opts, callback) {
        opts = mf.handleOpts('Factory.findByIndex', opts, callback);
        opts.limit = 1;
        mf.getByIndex(field, value, {db: opts.db, bucket: opts.bucket}, function (err, results) {
            if (Array.isArray(results) && results.length > 0) {
                results = results[0];
            } else {
                results = undefined;
            }
            opts.cb(err, results);
        });
    };

    
    return mf;
};
