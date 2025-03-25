const axios = require("axios");

const searchCourses = async (req, res) => {
  const { subCourse, language, duration } = req.query;

  let query = `${subCourse} course in ${language}`;
  if (duration === "short") query += " short";
  else if (duration === "long") query += " full tutorial";

  try {
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/search",
      {
        params: {
          part: "snippet",
          q: query,
          maxResults: 6,
          type: "video",
          key: process.env.AIzaSyD_DSQtxkjw3vkmOEd8IzfKVk4EGwdLRuI
        },
      }
    );

    res.json(response.data.items);
  } catch (error) {
    console.error("YouTube API Error:", error);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
};

module.exports = { searchCourses };