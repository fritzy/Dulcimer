var async = require('async'); 

module.exports = function (mf) {
    mf.options.foreignkey_fields = [];
    mf.options.collection_fields = [];

    (function () {
        var def_fields = Object.keys(mf.definition);
        var newdef, def, field;
        for (var fidx in def_fields) {
            def = mf.definition[def_fields[fidx]];
            field = def_fields[fidx];
            if (def.hasOwnProperty('foreignKey')) {
                mf.options.foreignkey_fields.push(field);
            } else if (def.hasOwnProperty('foreignCollection')) {
                mf.options.collection_fields.push(field);
            }
        }
    })();

    mf.extendModel({
        _loadForeign: function (db, depth, callback) {
            var obj = this;
            async.waterfall(
                [function (wcb) {
                    if (mf.options.foreignkey_fields.length > 0 && depth > 0) {
                        async.each(mf.options.foreignkey_fields,
                        function (field, ecb) {
                            if (typeof obj[field] === 'string') {
                                mf.definition[field].foreignKey.load(obj[field], {db: db, depth: depth - 1}, function (err, subresult) {
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
                                    mf.definition[field].foreignCollection.load(key, {db: db, depth: depth - 1}, function (err, subresult) {
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
