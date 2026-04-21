var express = require('express');
var router = express.Router();
const Collection = require('../models/collection');

// GET all campaigns
router.get('/', (req, res, next) => {
  Collection.find()
    .sort({ createdAt: -1 })
    .populate('creator', 'firstname lastname email')
    .exec()
    .then((campaigns) => {
      res.status(200).json({
        message: 'Campaigns fetched',
        count: campaigns.length,
        data: campaigns
      });
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

// GET one campaign by id
router.get('/:campaignId', (req, res, next) => {
  Collection.findById(req.params.campaignId)
    .populate('creator', 'firstname lastname email')
    .exec()
    .then((campaign) => {
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      res.status(200).json(campaign);
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

// POST create campaign
router.post('/', (req, res, next) => {
  const campaign = new Collection({
    type: req.body.type,
    title: req.body.title,
    category: req.body.category,
    description: req.body.description,
    fullStory: req.body.fullStory,
    images: req.body.images,
    creator: req.body.creator,
    location: req.body.location,
    goal: req.body.goal,
    status: req.body.status,
    deadline: req.body.deadline,
    fundUsage: req.body.fundUsage,
    eventDate: req.body.eventDate,
    receiverName: req.body.receiverName,
    suggestedAmounts: req.body.suggestedAmounts,
    allowAnonymousTips: req.body.allowAnonymousTips
  });

  campaign
    .save()
    .then((result) => {
      res.status(201).json({
        message: 'Campaign created',
        data: result
      });
    })
    .catch((err) => {
      res.status(400).json({ error: err.message });
    });
});

// PATCH update a campaign
router.patch('/:campaignId', (req, res, next) => {
  Collection.findByIdAndUpdate(
    req.params.campaignId,
    { $set: req.body },
    { new: true, runValidators: true }
  )
    .exec()
    .then((updatedCampaign) => {
      if (!updatedCampaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      res.status(200).json({
        message: 'Campaign updated',
        data: updatedCampaign
      });
    })
    .catch((err) => {
      res.status(400).json({ error: err.message });
    });
});

// POST delete campaign
router.delete('/:campaignId', (req, res, next) => {
  Collection.findByIdAndDelete(req.params.campaignId)
    .exec()
    .then((deletedCampaign) => {
      if (!deletedCampaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      res.status(200).json({ message: 'Campaign deleted' });
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

module.exports = router;