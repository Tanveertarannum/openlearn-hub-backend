const axios = require("axios");

const getVideosFromSource = async (subCourse) => {
  const apiKey = process.env.AIzaSyD_DSQtxkjw3vkmOEd8IzfKVk4EGwdLRuI;

  const response = await axios.get(
    `https://www.googleapis.com/youtube/v3/search`,
    {
      params: {
        part: "snippet",
        maxResults: 10,
        q: `${subCourse} course`,
        key: apiKey,
        type: "video",
      },
    }
  );

  const videos = response.data.items.map((item) => ({
    title: item.snippet.title,
    videoId: item.id.videoId,
    thumbnail: item.snippet.thumbnails.high.url,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
  }));

  return videos;
};

module.exports = getVideosFromSource;