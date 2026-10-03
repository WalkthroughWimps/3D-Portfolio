// Seconds in the current local LQ reels. Reviewed against the source footage.
// Cycle through distinct scenes; avoid title cards and alternate takes of the same scene.
export const previewSegments = {
  'online-classes': [
    // User bookmarks, paired by ascending timestamp (not bookmark labels).
    [6.105, 8.645],
    [15.585, 18.169],
    [27.294, 29.935],
    [35.666, 38.229],
    [51.475, 53.945],
    [68.510, 70.717],
    [77.515, 79.733],
    [108.878, 111.680],
    [116.898, 118.999],
    [121.845, 124.246],
  ],
  'a-list-videos': [
    // User bookmarks, paired by ascending timestamp (not bookmark labels).
    [31.650, 34.056],
    [34.966, 36.744],
    [52.301, 54.300],
    [67.691, 69.517],
    [74.126, 76.234],
    [83.795, 85.810],
    [105.971, 107.858],
  ],
  'news-broadcast': [
    // User bookmarks, paired by ascending timestamp.
    [25.522, 27.489],
    [32.916, 34.961],
    [53.320, 55.867],
    [64.452, 67.440],
    [80.245, 83.459],
    [110.142, 112.916],
  ],
  // User bookmarks, paired by ascending timestamp (not bookmark labels).
  'neotube-studios': [
    [17.970, 20.491],
    [31.641, 33.766],
    [41.989, 44.465],
    [62.861, 66.995],
    [74.085, 77.484],
    [109.426, 112.815],
    [121.989, 125.117],
    [127.550, 130.355],
  ],
  'music-videos': [
    // User bookmarks, paired by ascending timestamp.
    [10.429, 12.578],
    [18.742, 22.344],
    [48.506, 50.976],
    [55.900, 58.610],
    [72.672, 75.310],
    [112.545, 114.746],
  ],
  'random-vids': [
    // User bookmarks, paired by ascending timestamp (not bookmark labels).
    [36.969, 40.275],
    [44.219, 46.613],
    [54.733, 56.779],
    [55.300, 59.623],
    [82.240, 84.412],
    [93.694, 96.497],
    [112.103, 114.348],
    [123.639, 126.105],
  ],
};
