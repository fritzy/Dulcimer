var keylib = require('./keys');

module.exports = function (mf) {
    mf.extendModel({
        createChild: function (factory, obj) {
            var model = factory.create(obj);
            model.__verymeta.parent = this;
            return model;
        },
        getChildren: function (factory, opts, callback) {
            opts = mf.handleOpts(mf.options.name + 'getChildren', opts, callback);
            var prefix = keylib.joinChild(mf, keylib.joinSep(mf, '__child__', this.key), factory.options.prefix);
            opts.prefix = prefix;
            opts.parent = this;
            factory.all(opts, opts.cb);
        },
        getChildrenByIndex: function (factory, field, value, opts, callback) {
            var prefix = keylib.joinChild(mf, keylib.joinSep(mf, '__child__', this.key), factory.options.prefix);
            opts = mf.handleOpts(mf.options.name + 'getChildrenByIndex', opts, callback);
            opts.prefix = prefix;
            opts.parent = this;
            factory.getByIndex(field, value, opts, opts.cb);
        },
    });
    return mf;
};
