import xss from 'xss';

// Middleware to validate incoming support tickets
export function validateTicket(req, res, next) {
  const { subject, description, requesterId } = req.body;

  if (typeof subject !== 'string' || subject.trim().length < 5 || subject.length > 500) {
    return res.status(400).json({ error: 'Subject must be a string between 5 and 500 characters long.' });
  }

  if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > 2000)) {
    return res.status(400).json({ error: 'Description must be a string up to 2000 characters long.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const userRegex = /^user-\d+$/;

  if (typeof requesterId !== 'string' || (!emailRegex.test(requesterId) && !userRegex.test(requesterId))) {
    return res.status(400).json({ error: 'Requester ID must be a valid email or user identifier.' });
  }

  // Sanitize inputs to prevent XSS
  const xssOptions = {
    whiteList: {}, // strip all HTML tags
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  };

  req.body.subject = xss(subject, xssOptions);
  if (description !== undefined && description !== null) {
    req.body.description = xss(description, xssOptions);
  }
  req.body.requesterId = xss(requesterId, xssOptions);

  next();
}
