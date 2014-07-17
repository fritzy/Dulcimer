var async = require('async'); 

var model_cache = {};

module.exports = function (mf) {
    mf.options.foreignkey_fields = [];
    mf.options.collection_fields = [];

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
                                    var fbucket = [bucket[0], fmodel.options.name];
                                    if (typeof fmodel === 'string') {
                                        fmodel = model_cache[fmodel];
                                    }
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
                }],
            function (err) {
                callback(err, obj);
            });
        },
    });
};
