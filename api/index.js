import app from '../server/index.js';

export default async (req, res) => {
  return app(req, res);
};