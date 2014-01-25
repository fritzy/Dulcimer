var verymodel = require('verymodel');
var uuid = require('node-uuid');
var async = require('async');

function makeModelLevely(mf) {
    mf.addDefinition({
        key: {private: true,
        default: function () {
            return this.__verymeta.prefix + uuid.v4();
        },
        required: true},
    });

    mf.load = function (id, callback) {
        mf.options.db.get(id, function (err, result) {
            var obj;
            if (!err) {
                obj = mf.create(result);
                obj.key = id;
                callback(err, obj);
            } else {
                callback(err);
            }
        });
    };

    mf.delete = function (key, callback) {
        mf.options.db.del(key, callback);
    };

    mf.all = function (callback) {
        var objects = [];
        var err;
        var stream = mf.options.db.createReadStream({
            start : mf.options.prefix,
            end : mf.options.prefix + '~'
        });
        stream.on('data', function (entry) {
            var inst = mf.create(entry.value);
            inst.key = entry.key;
            objects.push(inst);
        });
        stream.on('error', function (error) {
            err = error;
            callback(err, null);
        });
        stream.on('close', function () {
            callback(err, objects);
        });
    };

    mf.getByIndex = function (field, value, callback) {
        if (this.definition[field].hasOwnProperty('index')) {
            this.options.db.get(this.definition[field].index, function (err, index) {
                if (err || !index) index = {};
                if (index.hasOwnProperty(value)) {
                    this.options.db.get(index[value], function (err, result) {
                        var obj;
                        if (!err) {
                            obj = mf.create(result);
                            obj.key = index[value];
                            callback(err, obj);
                        } else {
                            callback(err);
                        }
                    }.bind(this));
                } else {
                    callback("no index for value");
                }
            }.bind(this));
        } else {
            callback("field does not have index");
        }
    };

    mf.extendModel({
        save: function (callback) {
            async.waterfall([
                function (acb) {
                    this.__verymeta.db.put(this.key, this.toJSON(), acb);
                }.bind(this),
                function (acb) {
                    Object.keys(this.__verymeta.defs).forEach(function (field) {
                        var ikey;
                        if (this.__verymeta.defs[field].hasOwnProperty('index')) {
                            ikey = this.__verymeta.defs[field].index;
                            this.__verymeta.db.get(ikey, function (err, obj) {
                                var objkeys;
                                if (err || !obj) {
                                    obj = {};
                                }
                                objkeys = Object.keys(obj);
                                for (var kidx in objkeys) {
                                    if (obj[objkeys[kidx]] === this.key) {
                                        delete obj[objkeys[kidx]];
                                    }
                                }
                                obj[this[field]] = this.key;
                                this.__verymeta.db.put(ikey, obj, acb);
                            }.bind(this));
                        }
                    }.bind(this));
                }.bind(this),
            ],
            function (err) {
                callback(err);
            });
        },
        delete: function (callback) {
            this.__verymeta.db.del(this.key, callback);
        },
    });
    return mf;
}

function VeryLevelModel() {
    verymodel.VeryModel.apply(this, arguments);
    makeModelLevely(this);
}

VeryLevelModel.prototype = Object.create(verymodel.VeryModel.prototype);

module.exports = VeryLevelModel;

