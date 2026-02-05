interface SuccessResponse<T> {
  status: "success";
  statusCode: number;
  message: string;
  data: T;
}

import { Response } from "express";

export const apiResponse = <T>(
  res: Response,
  { statusCode = 200, message, data }: Partial<SuccessResponse<T>>,
): void => {
  res.status(statusCode).json({
    status: "success",
    statusCode,
    message,
    ...(data && { data }),
  });
};
