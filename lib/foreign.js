var async = require('async'); 

var model_cache = {};

module.exports = function (mf) {
    mf.options.foreignkey_fields = [];
    mf.options.collection_fields = [];
    mf.options.foreignkeys_fields = [];

    model_cache[mf.options.name] = mf;

    (function () {
        var def_fields = Object.keys(mf.definition);
        var newdef, def, field;
        for (var fidx in def_fields) {
            def = mf.definition[def_fields[fidx]];
            field = def_fields[fidx];
            if (def.hasOwnProperty('foreignKey')) {
                mf.options.foreignkey_fields.push(field);
            } else if (def.hasOwnProperty('foreignCollection')) {
                def.default = function () { return []; };
                def.required = true;
                mf.options.collection_fields.push(field);
            } else if (def.hasOwnProperty('foreignKeys')) {
                def.save = false;
                def.type = 'array';
                mf.options.foreignkeys_fields.push(field);
            }
        }
    })();

    mf.extendModel({
        _loadForeign: function (db, bucket, depth, callback) {
            var obj = this;
            async.waterfall(
                [function (wcb) {
                    if (mf.options.foreignkey_fields.length > 0 && depth > 0) {
                        async.each(mf.options.foreignkey_fields,
                        function (field, ecb) {
                            var fmodel, fbucket;
                            if (typeof obj[field] === 'string') {
                                if (typeof mf.definition[field].foreignKey === 'string') {
                                    fmodel = model_cache[mf.definition[field].foreignKey];
                                } else {
                                    fmodel = mf.definition[field].foreignKey;
                                }
                                fbucket = [bucket[0], fmodel.options.name];
                                fmodel.load(obj[field], {db: db, depth: depth - 1, bucket: fbucket}, function (err, subresult) {
                                    obj[field] = subresult;
                                    ecb(err);
                                });
                            } else {
                                ecb();
                            }
                        },
                        wcb);
                    } else {
                        wcb();
                    }
                },
                function (wcb) {
                    if (mf.options.collection_fields.length > 0 && depth > 0) {
                        async.each(mf.options.collection_fields,
                        function (field, ecb) {
                            var collection = [];
                            if (Array.isArray(obj[field])) {
                                async.each(obj[field],
                                function (key, acb) {
                                    var fmodel = mf.definition[field].foreignCollection;
                                    if (typeof fmodel === 'string') {
                                        fmodel = model_cache[fmodel];
                                    }
                                    var fbucket = [bucket[0], fmodel.options.name];
                                    fmodel.load(key, {db: db, depth: depth - 1, bucket: fbucket}, function (err, subresult) {
                                        collection.push(subresult);
                                        acb(err);
                                    });
                                },
                                function (err) {
                                    obj[field] = collection;
                                    ecb(err);
                                });
                            } else {
                                ecb();
                            }
                        },
                        wcb);
                    } else {
                        wcb();
                    }
                },
                function (wcb) {
                    if (mf.options.foreignkeys_fields.length > 0 && depth > 0) {
                        async.each(mf.options.foreignkeys_fields, function (field, ecb) {
                            var limit = mf.definition[field].autoLoad || mf.options.foreignKeyAutoLoad || 10;
                            //var model = mf.getModel(mf.definition[field].foreignKeys);
                            obj.getForeign(field, {limit: limit}, function (err, models, page) {
                                if (!obj.__verymeta.page) {
                                    obj.__verymeta.page = {};
                                }
                                obj.__verymeta.page[field] = page;
                                obj[field] = models;
                                ecb();
                            });
                        }, wcb);
                    } else {
                        wcb();
                    }
                }
            ],
            function (err) {
                callback(err, obj);
            });
        },
        getForeign: function (field, opts, callback) {
            opts = mf.handleOpts(mf.options.name + '.getForeign', opts, callback);
            if (!mf.definition.hasOwnProperty(field) || !mf.definition[field].hasOwnProperty('foreignKeys')) {
                opts.cb("The field \"" + field + "\" must contain the foriegnKeys definition.");
            }
            var model;
            model = mf.getModel(mf.definition[field].foreignKeys);
            opts.foreign = {key: '__main__!' + this.key, field: field, original: this};
            return model.all(opts, opts.cb);
        },
        getReverseForeign: function (model, field, opts, callback) {
            opts = mf.handleOpts(mf.options.name + '.getReverseForeign', opts, callback);
            model = mf.getModel(model);
            opts.foreign = {key: '__main__!' + this.key, field: field, reverse: true, original: this};
            return model.all(opts, opts.cb);
        },
        addForeign: function (field, other, opts, callback) {
            opts = mf.handleOpts(mf.options.name + '.addForeign', opts, callback);
            var obj = this;
            var otherkey = other;
            var primaryBucket = this.bucket;
            var secondaryBucket;
            if (typeof other !== 'string') {
                otherkey = other.key;
                secondaryBucket = other.bucket;
            }
            otherkey = '__main__!' + otherkey;
            var omodel;
            omodel = mf.definition[field].foreignKeys;
            if (typeof omodel === "string" && model_cache.hasOwnProperty(omodel)) {
                omodel = model_cache[omodel];
            }
            opts.db.addForeignKey('__main__!' + this.key, field, otherkey, {
                bucket: opts.bucket,
                primaryBucket: [primaryBucket || opts.bucket, omodel.options.name],
                secondaryBucket: [secondaryBucket || opts.bucket, mf.options.name],
            }, opts.cb);
        },
        removeForeign: function (field, other, opts, callback) {
            opts = mf.handleOpts(mf.options.name + '.removeForeign', opts, callback);
            var otherkey = other;
            var primaryBucket = this.bucket;
            var secondaryBucket;
            if (typeof other !== 'string') {
                otherkey = other.key;
                secondaryBucket = other.bucket;
            }
            var omodel;
            omodel = mf.definition[field].foreignKeys;
            if (typeof omodel === "string" && model_cache.hasOwnProperty(omodel)) {
                omodel = model_cache[omodel];
            }
            opts.primaryBucket = [primaryBucket || opts.bucket, mf.name];
            opts.secondaryBucket = [secondaryBucket || opts.bucket, omodel.definition.name];
            opts.db.delForeignKey(this.key, field, otherkey, opts.cb);
        },
        getForeignTotal: function (field, opts, callback) {
            opts = mf.handleOpts(mf.options.name + '.getForeignTotal', opts, callback);
            if (!Array.isArray(opts.bucket)) {
                opts.bucket = [opts.bucket, mf.options.name];
            }
            opts.db.getForeignTotal('__main__!' + this.key, field, {bucket: opts.bucket}, opts.cb);
        },
        getReverseForeignTotal: function (field, opts, callback) {
            opts = mf.handleOpts(mf.options.name + '.getReverseForeignTotal', opts, callback);
            if (!Array.isArray(opts.bucket)) {
                opts.bucket = [opts.bucket, mf.options.name];
            }
            opts.db.getReverseForeignTotal('__main__!' + this.key, field, {bucket: opts.bucket}, opts.cb);
        },
    });
};
