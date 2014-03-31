#VeryModel-Level

VeryModel-Level is an ORM for an embedded keystore in your Node.js app.

Features Include:

* Models
* Ordered Objects
* Lookup by Index
* Retrieving Models sorted by Index
* Retrieve index ranges
* Retrieve with filters
* Foreign Keys and Foreign Collections
* Children
* Pagination
* Counts
* Buckets
* onSave & onDelete Model Events
* derived fields
* field types and validation

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
* [required](#def-required)
* [default](#def-default)
* [save](#def-save)
* [private](#def-private)

<a name='def-type'></a>
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

<a name='def-validate'></a>
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

<a name='def-processIn'></a>
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

<a name='def-processOut'></a>
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

<a name='def-onSet'></a>
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

<a name='def-derive'></a>
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

<a name='def-foreignKey'></a>
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

<a name='def-foreignCollection'></a>
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

<a name='def-required'></a>
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

<a name='def-default'></a>
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

----

<a name='def-save'></a>
__save__

`save` is a boolean, true by default which determines whether a field should be omitted during save or not.

It can be handy to not save derived fields.

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
        save: false,
    }
});
```

---

<a name='def-private'></a>
__private__

`private` is a boolean, false by default, which determines whether a field is saved into the object upon [save](#save) and included in the object resulting from [toJSON()](#toJSON).

You can force private methods to be included in saved objects with the model option [savePrivate](#mo-savePrivate), while preserving [toJSON](#toJSON) omittion.

### Model Options

Model options are the second argument of the `VeryLevelModel` constructor.

Requirements:

* Models must have a name option.
* Models must have a db or a dbdir.
* Models may have a bucket. You may also define buckets elsewhere if dynamic.

__Note__: Multiple models and can should use the same bucket.
Multiple models SHOULD NOT use the same name.

Buckets are useful for seperating groups of data by access groups or other things.


Index:

* [name](#mo-name)
* [db](#mo-db)
* [dbdir](#mo-dbdir)
* [bucket](#mo-bucket)
* [onSave](#mo-onSave)
* [onDelete](#mo-onDelete)
* [savePrivate](#mo-savePrivate)
* [saveKey](#mo-saveKey)

Example:

```js
new VeryLevelModel({
        someField: {},
        someOtherField: {},
    },
    {
        name: 'person',
        db: levelup(__dirname + '/thisapp.db'),
    }
);

```
<a name='mo-name'></a>
__name__

The name is required should be a short (one or two word) alphanumeric string with no spaces.
This name is used as a prefix within the key store, as well as a string reference to the Model Factory itself to prevent circular requirements.

----

<a name='mo-db'></a>
__db__

The db field should refer to a [LevelUp](https://github.com/rvagg/node-levelup) or compatible library connection.

This field or [dbdir](#mo-dbdir) is required.

---

<a name='mo-dbdir'></a>
__dbdir__

This field should be a full directory path in which to store the databases if you're using buckets.

---

<a name='mo-bucket'></a>
__bucket__

This is the default bucket name for the model. Each method that interactions with the underlying database may override the bucket.

---

<a name='mo-onSave'></a>
__onSave__

`{onSave: function (err, details, done) { } }`

The details object contains: 

    {
        model: model-instance,
        changes: changes,
        ctx: ctx
    }


The changes is an object of fields with 'then', 'now', and 'changed', values.

    {
        field1: {then: 'cheese', now: 'ham', changed: true},
        field2: {then: 'who', now: 'whom', changed: true}
    }


The `ctx` argument is whatever you passed with the [ctx option](#op-ctx) to the [save method](#save).

If you require a full model instance of what used to be, do this:

    var oldmodel = details.model.getOldModel();

You must execute the done callback when done.

---

<a name='mo-onDelete'></a>
__onDelete__

`{onSave: function (err, details, donecb) { } }`

The details object contains:

    {
        ctx: ctx
    }

The `ctx` argument is whatever you passed to with [ctx option](#op-ctx) to the [delete method](#delete).

You must execute the done callback.

---

<a name='mo-savePrivate'></a>
__savePrivate__

A boolean, false by default, to enable saving of [private](#def-private) fields.

---

<a name='mo-saveKey'></a>
__saveKey__

A boolean, false by default, to enabling saving the key field within the object.

---

## Options and Callbacks

Most Model Factory and Model Instance methods require a callback.
Any method that does require a callback has an optional `options` object as the argument before the callback.

Most methods will take `db`, and `bucket` as options properties, which override the defaults set in `factory.options`.
Some methods will take pagination methods: `offset` and `limit`.
`save`, `update`, and `delete` methods can take a `ctx` object in options to pass on to the `factory.options.onSave` and `factory.options.onDelete` callbacks.

Callbacks are always required on functions that include them, and lead with an error-first approach.

### Common Options

* [db](#op-db)
* [bucket](#op-bucket)
* [offset](#op-offset)
* [limit](#op-limit)
* [sortBy](#op-sortBy)
* [indexValue](#op-indexValue)
* [indexRange](#op-indexRange)
* [index](#op-index)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [ctx](#op-ctx)
* [returnStream](#op-returnStream)

<a name='op-db'></a>
__db__

This option overrides the current database defined with mf.options.db or mf.options.dbdir + mf.options.bucket for the current call.

----

<a name='op-bucket'></a>
__bucket__

This overrides the current database defined with mf.options.dbdir + mfoptions.bucket.

----

<a name='op-offset'></a>
__offset__

This skips `offset` number of entries in a read call.

----

<a name='op-limit'></a>
__limit__

This limits the number of results in a read call.

----

<a name='op-sortBy'></a>
__sortBy__

`sortBy` must be an indexed field. The results of a read call are sorted by the value of this field.

----

<a name='op-indexValue'></a>
__indexValue__

Only get results from this indexed field with a specific value.
You must also specify the field with [index](#op-index).

----

<a name='op-indexRange'></a>
__indexRange__

Only get the results from this indexed field within a specific range (in order).

    {indexRange: {start: 'start value', end: 'end value'}}

You must also specify the field with [index](#op-index).

----

<a name='op-index'></a>
__index__

Index field to use for [indexRange](#op-indexRange) and [indexValue](#op-indexValue).

---

<a name='op-reverse'></a>
__reverse__

Boolean, when true, reverses the result order from a read call.

----

<a name='op-filter'></a>
__filter__

`filter` is a function that is given a model instance, and returns false to filter out the result, or true to keep the result. Model instances have expanded their foreign values yet.

Example:

```js
{filter: function (inst) {
        if (inst.lastName !== 'Fritz') {
            return false;
        }
        return true;
    }
}
```

----

<a name='op-depth'></a>
__depth__

`depth` is an integer, 5 by default, that determines how many recursive layers to expand [foreignKey](#def-foreignKey) and [foreignCollection](#def-foreignCollection) fields.

0 means means that it will not expand any keys.

----

<a name='op-ctx'></a>
__ctx__

Whater you assign to `ctx` will be passed to the resulting [onSave](#mo-onSave) or [onDelete](#onDelete) callbacks.

Useful for passing the user and other context from an HTTP API call to the model callbacks, and many other similar use cases.

----

<a name='op-returnStream'></a>
__returnStream__

A boolean, when true, causes a read function to return an object stream, and call the callback with the stream rather than the concatenated array of models.

----

## Model Factory Methods

* [create](#create)
* [get](#get)
* [all](#all)
* [update](#update)
* [delete](#factory-delete)
* [wipe](#wipe)
* [getByIndex](#getByIndex)
* [findByIndex](#findByIndex)

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
* callback: `function (err, model)`

Callback Arguments:

1. __err__: An error indicating failure to get the model instance.
2. __model__: A model instance of the Model Factory that called get (if there was no err).

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [depth](#op-depth)

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
* callback -- `function (err, models, pagination)`

Callback Arguments:

1. __err__: If err is set, there has been an error getting result.
2. __models__: An array of model instances unless the [returnStream option](#op-returnStream) is true, at which point it is an [object stream](http://nodejs.org/api/stream.html#stream_object_mode) of resulting model instances.
3. __pagination__: An object containing specified [limit](#op-limit), [offset](#op-offset), an actual `count` and potential `total` if no offset/limit had been assigned.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [offset](#op-offset)
* [limit](#op-limit)
* [sortBy](#op-sortBy)
* [index](#op-index)
* [indexValue](#op-indexValue)
* [indexRange](#op-indexRange)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [returnStream](#op-returnStream)


:information\_source: Internally, [all](#all) is called by other methods that retrieve multiple results, doing some of the options for you. For example, [getByIndex](#getByIndex) calls all with [index](#op-index) and [indexValue](#op-indexValue).

Example:

```js
Person.all({limit: 10}, function (err, persons) {
    persons.forEach(function (person) {
        console.log(person.toJSON());
    });
});
```

----

<a name="update"></a>
__update(key, merge_object, options, callback)__

Updates an existing stored model with new data.
It only overrides fields that you send.

Arguments:

* key
* merge\_object
* options
* callback -- `function (err, newmodel)`

Callback Arguments:

1. __err__: Only set when there's been an error updating the model.
2. __newmodel__: The model instance after it's been updated.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [ctx](#op-ctx)

Example:

```js
Person.update(somekey, {lastName: 'Fritz'}, {bucket: 'peopleILike'}, function (err, person) {
    console.log(person.toJSON()); //lastName will be Fritz, other values unchanged
});
```

----

<a name="factory-delete"></a>
__delete(key, options, callback)__

Deletes a stored model.

Arguments:

* key
* options
* callback -- `function (err) {}`

Options:

* [db](#op-db)
* [bucket](#op-db)

----

<a name="wipe"></a>
__wipe(options, callback)__

Deletes all models and their children from the database.

Arguments:

* options
* callback -- `function (err)`

CallBack Arguments:

1. __err__: Only set if an error occured during wipe.

Options:

* [db](#op-db)
* [bucket](#op-db)

:heavy\_exclamation\_mark: No really, it deletes everything for that model!

-----

<a name="getByIndex"></a>
__getByIndex(field, value, options, callback)__

Gets the models by an index.

Arguments: 

* field: indexed field
* value: value to match
* options
* callback -- `function (err, models, pagination)`

Callback Arguments:

1. __err__: Set only if there was an error.
2. __models__: An array of model instances unless the [returnStream option](#op-returnStream) is true, at which point it is an [object stream](http://nodejs.org/api/stream.html#stream_object_mode) of resulting model instances.
3. __pagination__: An object containing specified [limit](#op-limit), [offset](#op-offset), an actual `count` and potential `total` if no offset/limit had been assigned.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [offset](#op-offset)
* [limit](#op-limit)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [returnStream](#op-returnStream)


:information\_source: This ends up calling [all](#all) with some index options, so you get the same pagination features.

```javascript
Person.getByIndex('lastName', 'Fritz', function (err, persons) {
    console.log("All of the Fritzes.");
    persons.forEach(function (person) {
        console.log(person.key, person.fullName);
    });
});
```

-----

<a name="findByIndex"></a>
__findByIndex(field, value, options, callback)__

Just like [getByIndex](#getByIndex), except only return one value, rather than an array of models, or an error.

Arguments:

* field: indexed field
* value: value to match
* options
* callback -- `function (err, model)`

Callback Arguments:

1. __err__: Set only if there was an error.
2. __model__: Model instance if an index of the specified value was found. Otherwise `undefined`.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [depth](#op-depth)

```javascript
Person.findByIndex('phoneNumber', '509-555-5555', function (err, person) {
    if (!err && person) {
        console.log("Found person", person.toJSON(), '@ key', person.key);
    } else {
        console.log("Unable to find person with that phone number.");
    }
});
```

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
