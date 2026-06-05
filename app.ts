import type {Request, Response, NextFunction} from "express";

var createError = require('http-errors');
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per windowMs
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

var authRouter = require('./routes/auth');
var collectionsRouter = require('./routes/collections');
var contributionsRouter = require('./routes/contributions');
var withdrawalsRouter = require('./routes/withdrawals');

var app = express();
mongoose.Promise = global.Promise;

var mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error('Missing MONGO_URI in environment. Add it to your .env file.');
}

mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 10000
})
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((err: any) => {
    console.error('MongoDB connection error:', err.message);
  });

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
    return res.status(200).json({})
  }
  next();
}
)

app.use('/auth', authLimiter, authRouter);
app.use('/collections', collectionsRouter);
app.use('/contributions', contributionsRouter);
app.use('/withdrawals', withdrawalsRouter);

// catch 404 and forward to error handler
app.use(function (req: Request, res: Response, next: NextFunction) {
  next(createError(404));
});

// error handler
app.use(function (err: any, req: Request, res: Response, next: NextFunction) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;