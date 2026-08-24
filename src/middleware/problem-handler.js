export function problemHandler(error, req, res, next) {
  const status = error.status ?? error.statusCode ?? 500;

  const titles = {
    400: 'Bad Request',
    404: 'Not Found',
    422: 'Unprocessable Content',
    500: 'Internal Server Error',
  };

  const title = titles[status] ?? 'Request Error';

  return res.status(status).type('application/problem+json').json({
    type: 'https://marketplace.dev/problems/request-error',
    title,
    status,
    detail: error.message,
    instance: req.originalUrl,
  });
}
