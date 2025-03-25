const express = require("express");
const router = express.Router();
const { searchCourses } = require("../controllers/youtubeController");

router.get("/search", searchCourses);

module.exports = router;