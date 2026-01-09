module.exports = {
  secreto: process.env.JWT_SECRETO,
  expira: process.env.JWT_EXPIRA || '8h'
};
