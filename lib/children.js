module.exports = function (mf) {
    mf.extendModel({
        createChild: function (factory, obj) {
            var model = factory.create(obj);
            model.__verymeta.parent = this;
            return model;
        },
        getChild: function (factory, key, opts, callback) {
            opts = mf.handleOpts(mf.options.name + 'getChildren', opts, callback);
            opts.bucket = [opts.bucket, mf.options.name, '__child__', this.key, factory.options.name];
            factory.get(key, opts, opts.cb);
        },
        getChildren: function (factory, opts, callback) {
            opts = mf.handleOpts(mf.options.name + 'getChildren', opts, callback);
            opts.bucket = [opts.bucket, mf.options.name, '__child__', this.key, factory.options.name];
            opts.parent = this;
            factory.all(opts, opts.cb);
        },
        getChildrenByIndex: function (factory, field, value, opts, callback) {
            opts = mf.handleOpts(mf.options.name + 'getChildrenByIndex', opts, callback);
            opts.bucket = [opts.bucket, mf.options.name, '__child__', this.key, factory.options.name];
            opts.parent = this;
            factory.getByIndex(field, value, opts, opts.cb);
        },
    });
    return mf;
};
