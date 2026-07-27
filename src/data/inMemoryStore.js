const bloodRequests = [];

const users = [];

const donors = [
  {
    id: "donor-1",
    fullName: "Arta Krasniqi",
    bloodType: "O-",
    latitude: 42.6629,
    longitude: 21.1655,
    isAvailable: true,
  },
  {
    id: "donor-2",
    fullName: "Dren Gashi",
    bloodType: "A+",
    latitude: 42.6531,
    longitude: 21.1789,
    isAvailable: true,
  },
  {
    id: "donor-3",
    fullName: "Elira Berisha",
    bloodType: "B+",
    latitude: 42.6404,
    longitude: 21.1603,
    isAvailable: false,
  },
];

module.exports = {
  bloodRequests,
  users,
  donors,
};