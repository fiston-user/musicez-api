import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma';
import { hashApiKey } from '../utils/api-key-security';
import {
  formatApiKeySuccessResponse,
  formatApiKeyListResponse,
  formatApiKeyDeleteResponse,
  apiKeyErrorResponses,
  getHttpStatusForError,
} from '../utils/api-key-formatters';
import {
  ApiKeyRequest,
  ApiKeyUpdateRequest,
  ApiKeyQuery,
} from '../schemas/api-key.schemas';
import logger from '../utils/logger';

/**
 * API Key Controller - handles CRUD operations for service API keys
 */
export class ApiKeyController {
  constructor() {
    // Using centralized Prisma client from database module
  }

  /**
   * Create a new API key
   * POST /api/v1/admin/api-keys
   */
  public createApiKey = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;

    try {
      const { name, key, active }: ApiKeyRequest = req.body;

      logger.info('API key creation initiated', {
        name,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId,
      });

      // Check for duplicate name
      const existingApiKey = await prisma.apiKey.findFirst({
        where: { name },
      });

      if (existingApiKey) {
        logger.warn('API key creation failed - duplicate name', {
          name,
          existingId: existingApiKey.id,
          ip: req.ip,
          requestId,
        });

        const errorResponse = apiKeyErrorResponses.duplicateName(name, requestId);
        const statusCode = getHttpStatusForError(errorResponse.error.code);
        res.status(statusCode).json(errorResponse);
        return;
      }

      // Hash the API key for secure storage
      const hashedKey = await hashApiKey(key);

      // Create the API key record
      const apiKey = await prisma.apiKey.create({
        data: {
          name,
          key: hashedKey,
          active: active ?? true,
        },
      });

      const processingTime = Date.now() - startTime;

      logger.info('API key created successfully', {
        id: apiKey.id,
        name: apiKey.name,
        active: apiKey.active,
        processingTime,
        ip: req.ip,
        requestId,
      });

      // Log for audit trail
      logger.info('API key audit', {
        action: 'CREATE',
        apiKeyId: apiKey.id,
        name: apiKey.name,
        active: apiKey.active,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId,
        timestamp: new Date().toISOString(),
      });

      const response = formatApiKeySuccessResponse(apiKey, requestId);
      res.status(201).json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('API key creation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: req.body?.name,
        processingTime,
        ip: req.ip,
        requestId,
      });

      const errorResponse = apiKeyErrorResponses.internalError(requestId);
      const statusCode = getHttpStatusForError(errorResponse.error.code);
      res.status(statusCode).json(errorResponse);
    }
  };

  /**
   * Get all API keys with optional filtering
   * GET /api/v1/admin/api-keys
   */
  public getAllApiKeys = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;

    try {
      const { active, limit, offset }: ApiKeyQuery = req.query as any;

      logger.info('API keys list requested', {
        active,
        limit,
        offset,
        ip: req.ip,
        requestId,
      });

      // Build where clause based on filters
      const whereClause: any = {};
      if (active !== undefined) {
        whereClause.active = active;
      }

      // Get API keys with pagination
      const apiKeys = await prisma.apiKey.findMany({
        where: whereClause,
        take: limit || 20,
        skip: offset || 0,
        orderBy: { createdAt: 'desc' },
      });

      const processingTime = Date.now() - startTime;

      logger.info('API keys retrieved successfully', {
        count: apiKeys.length,
        active,
        limit,
        offset,
        processingTime,
        ip: req.ip,
        requestId,
      });

      const response = formatApiKeyListResponse(apiKeys, requestId);
      res.status(200).json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('API keys retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime,
        ip: req.ip,
        requestId,
      });

      const errorResponse = apiKeyErrorResponses.internalError(requestId);
      const statusCode = getHttpStatusForError(errorResponse.error.code);
      res.status(statusCode).json(errorResponse);
    }
  };

  /**
   * Get a specific API key by ID
   * GET /api/v1/admin/api-keys/:id
   */
  public getApiKeyById = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const { id } = req.params;

    try {
      logger.info('API key retrieval by ID initiated', {
        id,
        ip: req.ip,
        requestId,
      });

      const apiKey = await prisma.apiKey.findUnique({
        where: { id },
      });

      if (!apiKey) {
        logger.warn('API key not found', {
          id,
          ip: req.ip,
          requestId,
        });

        const errorResponse = apiKeyErrorResponses.notFound(requestId);
        const statusCode = getHttpStatusForError(errorResponse.error.code);
        res.status(statusCode).json(errorResponse);
        return;
      }

      const processingTime = Date.now() - startTime;

      logger.info('API key retrieved successfully', {
        id: apiKey.id,
        name: apiKey.name,
        active: apiKey.active,
        processingTime,
        ip: req.ip,
        requestId,
      });

      const response = formatApiKeySuccessResponse(apiKey, requestId);
      res.status(200).json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('API key retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        id,
        processingTime,
        ip: req.ip,
        requestId,
      });

      const errorResponse = apiKeyErrorResponses.internalError(requestId);
      const statusCode = getHttpStatusForError(errorResponse.error.code);
      res.status(statusCode).json(errorResponse);
    }
  };

  /**
   * Update an existing API key
   * PUT /api/v1/admin/api-keys/:id
   */
  public updateApiKey = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const { id } = req.params;
    const updateData: ApiKeyUpdateRequest = req.body;

    try {
      logger.info('API key update initiated', {
        id,
        updateFields: Object.keys(updateData),
        ip: req.ip,
        requestId,
      });

      // Check if API key exists
      const existingApiKey = await prisma.apiKey.findUnique({
        where: { id },
      });

      if (!existingApiKey) {
        logger.warn('API key update failed - not found', {
          id,
          ip: req.ip,
          requestId,
        });

        const errorResponse = apiKeyErrorResponses.notFound(requestId);
        const statusCode = getHttpStatusForError(errorResponse.error.code);
        res.status(statusCode).json(errorResponse);
        return;
      }

      // Check for duplicate name if name is being updated
      if (updateData.name && updateData.name !== existingApiKey.name) {
        const duplicateApiKey = await prisma.apiKey.findFirst({
          where: {
            name: updateData.name,
            id: { not: id }, // Exclude current API key
          },
        });

        if (duplicateApiKey) {
          logger.warn('API key update failed - duplicate name', {
            id,
            name: updateData.name,
            conflictingId: duplicateApiKey.id,
            ip: req.ip,
            requestId,
          });

          const errorResponse = apiKeyErrorResponses.duplicateName(
            updateData.name,
            requestId
          );
          const statusCode = getHttpStatusForError(errorResponse.error.code);
          res.status(statusCode).json(errorResponse);
          return;
        }
      }

      // Prepare update data
      const updatePayload: any = {};
      if (updateData.name !== undefined) updatePayload.name = updateData.name;
      if (updateData.active !== undefined) updatePayload.active = updateData.active;
      
      // Hash new key if provided
      if (updateData.key !== undefined) {
        updatePayload.key = await hashApiKey(updateData.key);
      }

      // Update the API key
      const updatedApiKey = await prisma.apiKey.update({
        where: { id },
        data: updatePayload,
      });

      const processingTime = Date.now() - startTime;

      logger.info('API key updated successfully', {
        id: updatedApiKey.id,
        name: updatedApiKey.name,
        active: updatedApiKey.active,
        updatedFields: Object.keys(updateData),
        processingTime,
        ip: req.ip,
        requestId,
      });

      // Log for audit trail
      logger.info('API key audit', {
        action: 'UPDATE',
        apiKeyId: updatedApiKey.id,
        name: updatedApiKey.name,
        active: updatedApiKey.active,
        updatedFields: Object.keys(updateData),
        previousName: existingApiKey.name,
        previousActive: existingApiKey.active,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId,
        timestamp: new Date().toISOString(),
      });

      const response = formatApiKeySuccessResponse(updatedApiKey, requestId);
      res.status(200).json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('API key update failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        id,
        updateData,
        processingTime,
        ip: req.ip,
        requestId,
      });

      const errorResponse = apiKeyErrorResponses.internalError(requestId);
      const statusCode = getHttpStatusForError(errorResponse.error.code);
      res.status(statusCode).json(errorResponse);
    }
  };

  /**
   * Delete an API key
   * DELETE /api/v1/admin/api-keys/:id
   */
  public deleteApiKey = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const { id } = req.params;

    try {
      logger.info('API key deletion initiated', {
        id,
        ip: req.ip,
        requestId,
      });

      // Check if API key exists
      const existingApiKey = await prisma.apiKey.findUnique({
        where: { id },
      });

      if (!existingApiKey) {
        logger.warn('API key deletion failed - not found', {
          id,
          ip: req.ip,
          requestId,
        });

        const errorResponse = apiKeyErrorResponses.notFound(requestId);
        const statusCode = getHttpStatusForError(errorResponse.error.code);
        res.status(statusCode).json(errorResponse);
        return;
      }

      // Delete the API key
      await prisma.apiKey.delete({
        where: { id },
      });

      const processingTime = Date.now() - startTime;

      logger.info('API key deleted successfully', {
        id: existingApiKey.id,
        name: existingApiKey.name,
        processingTime,
        ip: req.ip,
        requestId,
      });

      // Log for audit trail
      logger.info('API key audit', {
        action: 'DELETE',
        apiKeyId: existingApiKey.id,
        name: existingApiKey.name,
        active: existingApiKey.active,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId,
        timestamp: new Date().toISOString(),
      });

      const response = formatApiKeyDeleteResponse(
        'API key deleted successfully',
        requestId
      );
      res.status(200).json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('API key deletion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        id,
        processingTime,
        ip: req.ip,
        requestId,
      });

      const errorResponse = apiKeyErrorResponses.internalError(requestId);
      const statusCode = getHttpStatusForError(errorResponse.error.code);
      res.status(statusCode).json(errorResponse);
    }
  };

  /**
   * Update lastUsed timestamp for an API key (internal method)
   * Called when API key is accessed for external service authentication
   */
  public updateLastUsed = async (apiKeyId: string): Promise<void> => {
    try {
      await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastUsed: new Date() },
      });

      logger.debug('API key last used timestamp updated', {
        apiKeyId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to update API key lastUsed timestamp', {
        error: error instanceof Error ? error.message : 'Unknown error',
        apiKeyId,
      });
    }
  };
}

// Export controller instance
export const apiKeyController = new ApiKeyController();