#verymodel-level

This module extends [VeryModel](https://github.com/fritzy/verymodel) as `VeryLevelModel` to add methods to model factories and instances for saving and loading in leveldb.

Please refer to the [VeryModel documentation](https://github.com/fritzy/verymodel) to understand how models themselves behave.

## Factory Methods

### bucket

`bucket(bucketname)`

Return a new Factory using this bucket.

    Factory.bucket('something').get(...)

The same as:

    Factory.get('somekey', {bucket: 'something'}, function ...);

Except that you could re-use it.

The same as:

    var FactoryWithBucket = Factory.bucket('something');
    FactoryWithBucket.get('somekey', function ...);

###get

`get(key, function (err, modelinstance) { ... })`

Get an instance of the model by key.
Including the prefix in the key is optional.

###delete 
`delete(key, function (err) { ... })`

### update
`update(key, { model values to update }, opts, function (err, modelinstance) { ... })`

Opts: {validate: true} do validation of updated object before saving. Callback with errors rather than saving if validation fails.


### all
`all(opts, function(err, instances, info) { ... })`

    opts = {
        offset: 0, //number of keys in to offset 
        limit: -1, //max number of results (-1 for no limit)
        sortBy: 'field' //indexed field to sort by
        bucket: override bucket
        db: override levelup db connection
    }

`info` gives the offset, limit, sortBy, count, used, and the total.

### getByIndex
`getByIndex(indexed_field, value, opts, function (err, instances, info) { ... }`

    opts = {
        offset: 0, //number of keys in to offset 
        limit: -1, //max number of results (-1 for no limit)
        bucket: override bucket
        db: override db
    }

`info` gives the offset, limit, sortBy, count, used, and the total.

### findByIndex
`findByIndex(indexed_field, value, opts, function (err, instance) { ... }`
    
    opts = {
        bucket: override bucket
        db: override db
    }

## Instance Methods

###save
`save(opts, function(err) { ... })`

    opts: {
        ctx: 'context value to pass to onSave'
        bucket: override bucket
        db: override db
    }

###delete
`delete(opts, function (err) { ... })`

    opts = {
        bucket: override bucket
        db: override db
    }

###createChild
`createChild(factory, { values }, function (err, instance) { ... })`

###getChildren
`getChildren(factory, opts, function (err, instances, info) { ... })`

###getChildrenByIndex
`getChildrenByIndex(factory, indexed_field, value, opts, function(err, instances, info) { ... })`

## Options

The VeryLevelModel constructor takes field definitions and options objects. The options object may contain the following fields:

* `db` the levelup instance
* `prefix` the key prefix unique to this model factory in this database
* `onSave` a function that is called when the model instance is saved
* `bucket` a bucket to save an load, like a sub-database
* `dbdir` directory to keep all db files in

### onSave

    function (err, {model, changes, ctx}, cb) {
    }

The changes is an object of fields with 'then', 'now', and 'changed', values.

    {
        field1: {then: 'cheese', now: 'ham', changed: true},
        field2: {then: 'who', now: 'whom', changed: true}
    }


If you require a full model instance of what used to be, do this:

    var oldmodel = model.getOldModel();

The `ctx` argument is whatever you passed to `save({ctx: 'ctx goes here'}, function ...`

You must execute the callback as is the callback you passed save.

### onDelete

    function (err, {ctx}, cb) {
    }

The `ctx` argument is whatever you passed to `delete({ctx: 'ctx goes here'}, function ...`

You must execute the callback as is the callback you passed delete.


## Attaching DB and Prefixes

VeryModel factories have an `options` attribute.
VeryLevelModel uses `options.db` and `options.prefix`. Both are required.
    
    var VeryLevelModel = require('verymodel-level');
    var level = require('level');
    var db = level('./somedb', {valueEncoding: 'json'});

    var Person = new VeryLevelModel(def, {db: db, prefix: '!person'});

or you can set `Person.options.db` and `Person.options.prefix` later.


## Keys

All VeryLevelModel instances have special fields: `key` & `keyname`.
You may override keyname, otherwise it is a uuid.
`key` is derived from `options.prefix`, `options.sep`, and `keyname`.

key is:  
`factory.options.prefix + (factory.options.sep ||  '!') + keyname`

Child keys are prefixed by the parent's `key`
`+ (factory.options.childsep || '~') + factory.options.prefix + (factory.options.sep || '~') + keyname`

The prefix and seperators are used for `all()` and `getChildren()` and related functions..

## Indexes

Indexes can be declared in a field definition with `index: true` or `index_int: true`.


## 

    var VeryLevelModel = require('verymodel-level');
    var level = require('level');
    var db = level('./hi', {valueEncoding: 'json'});

    var Person = new VeryLevelModel({
        first_name: {},
        last_name: {},
        full_name: {derive: function () {
            return this.first_name + ' ' + this.last_name;
            }, private: false},
        experience: {},
        title: {},
    }, {db: db, prefix: 'person'});


    var gar = Person.create({
        first_name: 'Michael', 
        last_name: 'Garvin',
    });


    gar.save(function (err) {
        Person.load(gar.key, function (err, person) {
            console.log(person.toJSON());
            console.log(person.key);
        });
    });

    Person.all(function (err, objs) {
        objs.forEach(function (person) {
            console.log("=-=-=-=-=-=");
            console.log(person.toJSON({withPrivate: true}));
        });
    });
