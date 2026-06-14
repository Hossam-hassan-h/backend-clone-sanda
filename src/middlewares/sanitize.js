const noSqlSanitizer = (req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const key in obj) {
      if (key.startsWith("$")) {
        delete obj[key];
        continue;
      }
      if (typeof obj[key] === "object" && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };

  sanitize(req.body);
  sanitize(req.params);
  next();
};

export default noSqlSanitizer;