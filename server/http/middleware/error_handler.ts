import { Response, Request, NextFunction } from "express";
import { HttpError } from "../../utils/error";
import $logger from "../../utils/logger";
import $config from "../../utils/config";

export default function errorHandler(
    err: HttpError,
    req: Request,
    res: Response,
    next: NextFunction
) {
    let code = err.httpCode || 500;

    if (code >= 500) {
        $logger.error(err);
    } else {
        $logger.debug(err.message);
    }

    return res.status(code).json($config.dev_mode ? err : err.message);
}
