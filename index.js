var verymodel = require('verymodel');
var uuid = require('node-uuid');

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

    mf.extendModel({
        save: function (callback) {
            this.__verymeta.db.put(this.key, this.toJSON(), callback);
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

