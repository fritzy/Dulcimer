#VeryModel-Level

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
var VeryLevelModel = require('verymodel-level');
var levelup = require('levelup');
var db = levelup('./test.db');

var PersonFactory = new VeryLevelModel({
    firstName: {},
    lastName: {},
    fullName: {derive: function () {
        return this.firstName + ' ' + this.lastName;
    }},
}, {db: db, name: 'person'});

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
* [Options and Callbacks](#options-and-callbacks)
* [Model Factory Methods](#model-factory-methods)
* [Model Instance Methods](#model-instance-methods)

## Installing
`npm install verymodel-level`

## Defining a Model Factory
Model Factories define the platonic model, and can create model instances.
These models are extensions on [VeryModel](https://github.com/fritzy/verymodel).
Creating a new model factory involves passing two arguments: an object describing each field, and an options object defining the configuration of the model (leveldb path, model name, etc).

### Model Definitions

Every root property of a model definition is a field name with an object value defining types, restrictions, and processing for a model field. In it's simplest form, a field definition can just be an empty object, and then you can assign anything to that field. If a field isn't mentioned in the defition, it won't be saved or loaded.

#### Field Definition Properties

When making a model, you must defined the fields in the model.
A field definition may be a simple empty `{}` if anything goes.

Most field definition properties that can be functions are called with the model instance as the `this` context.


* [type](#def-type)
* [validate](#def-validate)
* [processIn](#def-processIn)
* [processOut](#def-processOut)
* [onSet](#def-onSet)
* [derive](#def-derive)
* [foreignKey](#def-foreignKey)
* [foreignCollection](#def-foreignCollection)


<a name='def_type'></a>
__type__

A string which references a built in type.
Built in types include `string`, `array`, `integer`, `numeric`, `enum`, `boolean`.
Strings and arrays may have `min` and `max` values, both for validation, and max will truncate the results when saving or on `toJSON`.
Enums may include `values`, an array (and eventually a ECMAScript 6 set).

You can override any of the definition fields of a specified type. Validate, processIn, processOut, and onSet will use both the built-in and your override. The others will replace the definition field.

`type` does not need to be set at all. In fact, `{}` is a perfectly valid definition.

Example:

    {field: {type: 'string', max: 140}}


----

<a name='def_validate'></a>
__validate__

The `validate` field takes a value and should determine whether that value is acceptable or not. It's ran during `doValidate()` or during `save` if you set the option `validateOnSave: true`.
The function should return a boolean, an array of errors, an empty array, or an error string.

Example:

```js
new VeryModelLevel({field: {
    validate: function (value) {
        //validate on even
        return (value % 2 === 0);
    }
});
```

----

<a name='def_processIn'></a>
__processIn__

`processIn` is a function that is passed a value on loading from the database, `create`, or `loadData`. It should return a value.

This function is often paired with `processOut` in order to make an interactive object when in model form, and a serialized form when saved.

`processIn` does not handle the case of direct assignment like `modelinst.field = 'cheese';`. Use `onSet` for this case.

Example:

```javascript
new VeryLevelModel({someDateField: {
    processIn: function (value) {
        return moment(value);
    },
})
```

----

<a name='def_processOut'></a>
__processOut__

`processOut` is a function that takes a value and returns a value, just like `processIn`, but is typically used to serialize the value for storage. It runs on `save()` and `toJSON()`.

Example:

```javascript
new VeryLevelModel({someDateField: {
    processIn: function (value) {
        return moment(value);
    },
})
```

----

<a name='def_onSet'></a>
__onSet__

`onSet` is just like `processIn`, except that it only runs on direct assignment. It's a function that takes a value and returns a value.

Example:

```javascript
new VeryLevelModel({someDateField: {
    processIn: function (value) {
        return moment(value);
    },
    onSet: function (value) {
        if (moment.isMoment(value)) {
            return value;
        } else {
            return moment(value);
        }
    },
    processOut: function (value) {
        return value.format();
    },
})
```

----

<a name='def_derive'></a>
__derive__

`derive` is a function that returns a value whenever the field is accessed (which can be quite frequent. The `this` context, is the current model instance, so you can access other fields.

Example:

```js
new VeryLevelModel({
    firstName: {type: 'string'},
    lastName: {type: 'string'},
    fullName: {
        type: 'string',
        derive: function () {
            return [this.firstName, this.lastName].join(" ");
        },
    }
});
```

----

<a name='def_foreignKey'></a>
__foreignKey__

`foreignKey` should be a Model Factory or a string of the factory name.
These fields are saved as their key, but when loaded expanded out to be a model instance of the key's value.
`get` will load and expand `foreignKey`s and `foreignCollections` up to the `depth` option provided (which is 5 by default).

When assigning values to this field, you can either assign a model instance or a key string.

Example: 

```js
new VeryLevelModel({
    comment: {'string'},
    author: {foreignKey: 'user'},
});
```

----

<a name='def_foreignCollection'></a>
__foreignCollection__

`foreignCollection`'s are like `foreignKey`'s except they are of an array type.
Values are saved as an array of key strings, and expanded out by when the model is retrieved with `get` up to the default depth of 5 or overriden with `{depth: 24}` on the `get` command.

When assigning values to these fields, you may either assign an array of model instances or an array of key strings.

Example: 

```js
new VeryLevelModel({
    comment: {'string'},
    author: {foreignKey: 'user'},
    starredBy: {foreignCollection: 'user'}
});
```

----

<a name='def_required'></a>
__required__

`required` is a boolean, false by default.
A required field will attempt to bring in the `default` value if a value is not present.

Example:

```js
new VeryLevelModel({
    comment: {'string',
        required: true,
        default: "User has nothing to say."
    },
    author: {foreignKey: 'user'},
    starredBy: {foreignCollection: 'user'}
});
```

----

<a name='def_default'></a>
__default__

`default` may be a value or a function. Default is only brought into play when a field is `required` but not assigned.
In function form, `default` behaves similiarly to `derive`, except that it only executes once.

```js
new VeryLevelModel({
    comment: {'string',
        required: true,
        default: function () {
            return this.author.fullName + ' has nothing to say.';
        },
    },
    author: {foreignKey: 'user'},
    starredBy: {foreignCollection: 'user'}
});
```


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

Note: Multiple models and can should use the same bucket.
Multile models SHOULD NOT use the same name.

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

----

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

<a name="instance-delete"></a>
__delete(options, callback)__

----

<a name="createChild"></a>
__createChild(otherModelFactory, value_object)__

----

<a name="getChildren"></a>
__getChildren(otherModelFactory, options, callback)__

----

<a name="getChildrenByIndex"></a>
__getChildrenByIndex(otherModelFactory, field, value, options, callback)__

----

<a name="findChildByIndex"></a>
__findChildByIndex(otherModelFactory, field, value, options, callback)__

----

<a name="toJSON"></a>
__toJSON()__

----

<a name="toString"></a>
__toString()__

----

<a name="diff"></a>
__diff()__

----

<a name="getChanges"></a>
__getChanges()__

----

<a name="getOldModel"></a>
__getOldModel()__

----

<a name="loadData"></a>
__loadData()__

----
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


## Field Filtering

By default, fields marked `private: true` will not be saved, but you can override that with `factory.options.savePrivate = true` You can seperately mark fields as not saved in the field definition with `save: false`.

These destinctions are useful for things like password fields that you wouldn't want to be exposed to an API with toJSON, but do want to save.

## Foreign Keys and Collections

You can refer to foreign objects, and have them load automatically with an object by with foreignKey and foreignCollection field defintions. They should point to another VeryLevelModel Factory.

While recursive loading happens automatically, only the keys of the sub-objects are saved on save(). If you've changed fields in the foreign objects, you must save those directly.

