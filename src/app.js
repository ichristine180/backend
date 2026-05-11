const express = require('express');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(express.json());

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/audit',        require('./routes/audit'));
app.use('/api/applications',    require('./routes/applications'));
app.use('/api/documents',       require('./routes/documents').router);
app.use('/api/document-types',  require('./routes/documentTypes'));

app.use(errorHandler);

module.exports = app;
