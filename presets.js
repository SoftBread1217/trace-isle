export const SYDNEY_HARBOUR = {
  name: '示例路线 · 悉尼海港',
  points: [
    [-33.85662, 151.21527], [-33.85729, 151.21498], [-33.85803, 151.21443],
    [-33.85861, 151.21349], [-33.85948, 151.21323], [-33.86020, 151.21204],
  ],
};

// Independently drawn demonstration loop inside OSM sports-centre way 1125998153.
// Degrees are WGS84; the ellipse is illustrative geometry for the in-page receiver.
const centre = [18.40139, 110.01342];
const radians = degrees => degrees * Math.PI / 180;
const bearing = radians(-12);
const longitudeScale = 111195 * Math.cos(radians(centre[0]));
const stadiumPoints = Array.from({ length: 32 }, (_, index) => {
  const angle = 2 * Math.PI * index / 32;
  const along = 76 * Math.cos(angle);
  const across = 47 * Math.sin(angle);
  const north = along * Math.cos(bearing) - across * Math.sin(bearing);
  const east = along * Math.sin(bearing) + across * Math.cos(bearing);
  return [Number((centre[0] + north / 111195).toFixed(6)),
    Number((centre[1] + east / longitudeScale).toFixed(6))];
});

export const LINGSHUI_STADIUM = {
  name: '陵水体育场 · 示意环线',
  points: [...stadiumPoints, [...stadiumPoints[0]]],
};
