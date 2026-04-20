var express = require('express');
var bcrypt = require('bcrypt');
var mongoose = require('mongoose');
var jwt = require('jsonwebtoken');
var router = express.Router();

const User = require('../models/auth');

// GET all users
router.get('/users', (req, res, next) => {
  User.find()
  .exec()
  .then(users => {
    res.status(200).json({
      message: 'Users fetched',
      count: users.length,
      data: users
    })
  })
  .catch(err => {
    res.status(500).json({error: err})
  })
})

// GET user details
router.get('/user/:userId', (req, res, next) => {
  const id = req.params.userId;
  User.findById(id)
  .exec()
  .then(user => {
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      })
    }
    res.status(200).json({
      user
    })
  })
  .catch(err => {
    res.status(500).json({ error: err.message });
  })
})

// POST create user
router.post('/register', (req, res, next) => {
    User.find({email: req.body.email})
    .exec()
    .then(user => {
      if (user.length >= 1) {
        return res.status(409).json({
          message: 'User with this mail already exists'
        })
      } else {
        bcrypt.hash(req.body.password, 10, (err, hash) => {
          if (err) {
            return res.status(500).json({error: err})
          } else {
            const user = new User({
              _id: new mongoose.Types.ObjectId(),
              firstname: req.body.firstname,
              lastname: req.body.lastname,
              email: req.body.email,
              phone: req.body.phone,
              country: req.body.country,
              password: hash,
              role: req.body.role, // creator|donor
              createdAt: new Date().toISOString()
            })
            user.save()
            .then(result => {
              res.status(201).json({
                message: "User created successfully",
                user: result
              });
            })
            .catch(err => {
              res.status(500).json({error: err})
            })
          }
        })
      }
    })
});

// POST user login
router.post('/login', (req, res, next) => {
  User.find({email: req.body.email})
  .exec()
  .then(user => {
    if (user.length < 1) {
      return res.status(401).json({
        message: 'Invalid login details'
      })
    }
    bcrypt.compare(req.body.password, user[0].password, (err, result) => {
      if (err) {
        return res.status(401).json({
          message: 'Invalid login details'
        })
      }
      if (result) {
        const token = jwt.sign(
          {
            email: user[0].email,
            userId: user[0]._id
          },
          process.env.JWT_KEY,
          {
            expiresIn: "72h"
          }
        )

        res.status(201).json({
          message: 'Login successful',
          token
        })
      }
    })
  })
  .catch(err => {
    res.status(500).json({error: err})
  })
})

// POST user logout (to be handled on frontend by deleting token)

module.exports = router;
