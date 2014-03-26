#Dulcimer DB

VeryModel-Level is an ORM for an embedded keystore in your Node.js app.

Features Include:

* Ordered Objects
* Lookup by Index
* Retrieving Models sorted by Index
* Foreign Keys and Foreign Collections
* Children
* Pagination
* Counts
* Buckets
* onSave & onDelete Model Events

The models in this ORM use  [VeryModel](https://github.com/fritzy/verymodel) so Verymodel-level extends the definitions and methods.

## A Quick Example

```js
var VeryLevelModel = requrie('verymodel-level');
var levelup = require('levelup');
var db = levelup('./test.db');

var PersonFactory = new VeryLevelModel({
    firstName: {},
    lastName: {},
    fullName: {derive: function () {
        return this.firstName + ' ' + this.lastName;
    }},
}, {db: db, prefix: 'person'});

var nathan = PersonFactory.create({
    firstName: 'Nathan',
    lastName: 'Fritz',
});
nathan.save(function (err) {
    PersonFactory.all(function (err, persons) {
        persons.forEach(function (person) {
            console.dir(person.toJSON());
        });
    });
});
```

## Index

* [Installing](#installing)
* [Defining a Model](#defining-a-model-factory)
* [Options and Callbacks](#optionsandcallbacks)
* [Model Factory Methods](#model-factory-methods)
* [Model Instance Methods](#model-instance-methods)

## Installing
`npm install verymodel-level`

## Defining a Model Factory
Model Factories define the platonic model, and can create model instances.
These models are extensions on [VeryModel](https://github.com/fritzy/verymodel).
Creating a new model factory involves passing two arguments: an object describing each field, and an options object defining the configuration of the model (leveldb path, model name, etc).

### Model Definitions

Every root property of a model definition is a field name.

TODO .... specifics

### Model Options

* name: String name of model
* db: levelup or levelup compatible instance database
* dbdir: automatically create leveldb files in this directory
* bucket: name of bucket
* onSave: -- function
* onDelete --

Requirements:

* Models must have a name option.
* Models may have a db or a dbdir.
* Models may have a bucket. You may also define buckets elsewhere if dynamic.

Examples:

```js
{
    name: 'person',
    db: levelup(__dirname + '/thisapp.db'),
}
```
```js
{
    name: 'person',
    dbdir: __dirname + '/database/',
    bucket: 'hampeople',
}
```

Buckets are useful for seperating groups of data by access groups or other things.

## Options and Callbacks

Most Model Factory and Model Instance methods require a callback.
Any method that does require a callback has an optional `options` object as the argument before the callback.

Most methods will take `db`, and `bucket` as options properties, which override the defaults set in `factory.options`.
Some methods will take pagination methods: `offset` and `limit`.
`save`, `update`, and `delete` methods can take a `ctx` object in options to pass on to the `factory.options.onSave` and `factory.options.onDelete` callbacks.

Callbacks are always required on functions that include them, and lead with an error-first approach.

## Model Factory Methods

* [create](#create)
* [get](#get)
* [all](#all)
* [update](#update)
* [delete](#factory-delete)
* [wipe](#wipe)
* [getByIndex](#getByIndex)
* [findByIndex](#findByIndex)
* [bucket](#bucket)

<a name="create"></a>
__create(value_object)__

Returns a factory instance model.

Create makes a new instance of the model with specific data.
Any fields in the value\_object that were not defined get thrown out.
Validations are not done on creation, but some values may be processed based on the field defintion type and processIn functions.

Create does not save the value; you'll have to run `.save(function (err) { ... })` on the returned model instance.

The model instance's private `.key` field will not be set until it has been saved either.

Logging the model out to console will produce a confusing result.
If you want the model's data, run `.toJSON()` and use the result.

Example:

```js
//assuming Person is a defined Model Factory
var person = Person.create({
    firstName: 'Nathan',
    lastName: 'Fritz',
});
person.save(function (err) {
    console.log("Person saved as:", person.key);
});
```

----

<a name="get"></a>
__get(key, options, callback)__

Get a specific model instance by key.

Arguments: 

* key
* options
* callback -- `function (err, model)`

Options:

* db: levelup instance
* bucket: bucket name
* depth: integer depth to recursively resolve foreign objects (default 5)

Example:

```js
Person.get(someperson_key, {depth: 0}, function (err, person) {
    if (!err) {
        console.dir(person.toJSON());
    }
});
```
----

<a name="all"></a>
__all(options, callback)__

Get many/all of the model instances saved of this model factory
Results are in order of insertion unless ordered by an indexed field.

Arguments:

* options
* callback -- `function (err, models, pagination) { }`

`models` in callback is an array of model instances unless returnStream is true in options.

Options:

* db: levelup instance
* bucket: bucket name
* depth: integer depth to recursively resolve foreign objects (default 5)
* sortBy: indexed field to results in order of value
* offset: integer to offset results by (pagination)
* limit: integer limit of results (pagination)
* returnStream: boolean (default false) returns stream of objects rather than using callback (callback is also called with stream instead of array)

----

<a name="update"></a>
__update(key, merge_object, options, callback)__

Updates an existing stored model with new data.
It only overrides fields that you send.

Arguments:

* key
* merge\_object
* options
* callback -- `function (err, newmodel) {}`

Options:

* db: levelup instance
* bucket: bucket name
* ctx: context object to send to `factory.options.onSave` upon success

----

<a name="factory-delete"></a>
__delete(key, options, callback)__

Deletes a stored model.

Arguments:

* key
* options
* callback -- `function (err) {}`

Options:

* db: levelup instance
* bucket: bucket name

----

<a name="wipe"></a>
__wipe(options, callback)__

Deletes all models and their children from the database.

Arguments:

* options
* callback -- `function (err) {}`

Options:

* db: levelup instance
* bucket: bucket name

-----

<a name="getByIndex"></a>
__getByIndex(field, value, options, callback)__

Gets the models by an index.

Arguments: 

* field -- indexed field
* value -- value to match
* options
* callback -- `function (err, models, pagination) { }`

`models` in callback is an array of model instances unless returnStream is true in options.

Options:

* db: levelup instance
* bucket: bucket name
* depth: integer depth to recursively resolve foreign objects (default 5)
* offset: integer to offset results by (pagination)
* limit: integer limit of results (pagination)
* returnStream: boolean (default false) returns stream of objects rather than using callback (callback is also called with stream instead of array)

This ends up calling [all](#all) with some index options, so you get the same pagination features.

-----

<a name="findByIndex"></a>
__findByIndex(field, value, options, callback)__

Just like [getByIndex](#getByIndex), except only return one value, rather than an array of models, or an error.

Arguments:

* field -- indexed field
* value -- value to match
* options
* callback -- `function (err, models, pagination) { }`

`models` in callback is an array of model instances unless returnStream is true in options.

Options:

* db: levelup instance
* bucket: bucket name
* depth: integer depth to recursively resolve foreign objects (default 5)
------

<a name="bucket"></a>
__bucket(name)__

Returns a new Factory, set up for the bucket named.
Factory.options.dbdir must be set.

Arguments:

* name -- bucket name


## Model Instance Methods

* [save](#save)
* [delete](#delete)
* [createChild](#createChild)
* [getChildren](#getChildren)
* [getChildrenByIndex](#getChildrenByIndex)
* [findChildByIndex](#findChildByIndex)
* [toJSON](#toJSON)
* [toString](#toString)
* [diff](#diff)
* [getChanges](#getChanges)
* [getOldModel](#getOldModel)
* [loadData](#loadData)

<a name="save"></a>
__save(options, callback)__

----


<a name="save"></a>
__save(options, callback)__

----


<a name="save"></a>
__save(options, callback)__

----


<a name="save"></a>
__save(options, callback)__

----


<a name="save"></a>
__save(options, callback)__

----

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

###wipe
`wipe(opts, function (err) { ... })`

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

## Field Filtering

By default, fields marked `private: true` will not be saved, but you can override that with `factory.options.savePrivate = true` You can seperately mark fields as not saved in the field definition with `save: false`.

These destinctions are useful for things like password fields that you wouldn't want to be exposed to an API with toJSON, but do want to save.

## Foreign Keys and Collections

You can refer to foreign objects, and have them load automatically with an object by with foreignKey and foreignCollection field defintions. They should point to another VeryLevelModel Factory.

While recursive loading happens automatically, only the keys of the sub-objects are saved on save(). If you've changed fields in the foreign objects, you must save those directly.

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
