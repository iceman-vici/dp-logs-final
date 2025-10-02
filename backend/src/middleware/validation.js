const validateDateRange = (req, res, next) => {
  const { from, to } = req.query;

  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
        details: 'Dates must be in ISO format'
      });
    }

    if (fromDate > toDate) {
      return res.status(400).json({
        error: 'Invalid date range',
        details: 'From date cannot be after to date'
      });
    }

    // Check if date range is not too large (e.g., max 90 days)
    const daysDifference = (toDate - fromDate) / (1000 * 60 * 60 * 24);
    if (daysDifference > 90) {
      return res.status(400).json({
        error: 'Date range too large',
        details: 'Maximum allowed range is 90 days'
      });
    }
  }

  next();
};

const validatePagination = (req, res, next) => {
  const { limit, offset, page, perPage } = req.query;

  if (limit) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'Invalid limit',
        details: 'Limit must be between 1 and 100'
      });
    }
    req.query.limit = limitNum;
  }

  if (offset) {
    const offsetNum = parseInt(offset);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'Invalid offset',
        details: 'Offset must be a positive number'
      });
    }
    req.query.offset = offsetNum;
  }

  if (page) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        error: 'Invalid page',
        details: 'Page must be a positive number'
      });
    }
    req.query.page = pageNum;
  }

  if (perPage) {
    const perPageNum = parseInt(perPage);
    if (isNaN(perPageNum) || perPageNum < 1 || perPageNum > 100) {
      return res.status(400).json({
        error: 'Invalid perPage',
        details: 'perPage must be between 1 and 100'
      });
    }
    req.query.perPage = perPageNum;
  }

  next();
};

const validateCallId = (req, res, next) => {
  const { id } = req.params;

  if (!id || id.trim() === '') {
    return res.status(400).json({
      error: 'Invalid call ID',
      details: 'Call ID is required'
    });
  }

  next();
};

module.exports = {
  validateDateRange,
  validatePagination,
  validateCallId
};