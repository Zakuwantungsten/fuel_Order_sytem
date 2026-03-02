import { Request, Response } from 'express';
import { SIEMConfig } from '../models/SIEMConfig';
import { AuditService } from '../utils/auditService';

/**
 * SIEM Export / Audit Event Streaming Controller
 */

// List all SIEM configurations
export const listConfigs = async (_req: Request, res: Response): Promise<void> => {
  try {
    const configs = await SIEMConfig.find()
      .select('-splunkToken') // Never return tokens
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: configs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a SIEM configuration
export const createConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { name, destination, webhookUrl, webhookHeaders, syslogHost, syslogPort, syslogProtocol, splunkUrl, splunkToken, eventFilters, batchSize, flushIntervalSeconds, retryAttempts } = req.body;

    if (!name || !destination) {
      res.status(400).json({
        success: false,
        message: 'name and destination are required',
      });
      return;
    }

    const config = await SIEMConfig.create({
      name,
      destination,
      webhookUrl,
      webhookHeaders,
      syslogHost,
      syslogPort,
      syslogProtocol,
      splunkUrl,
      splunkToken,
      eventFilters: eventFilters || { severities: ['critical', 'high'], actions: [], minRiskScore: 0 },
      batchSize: batchSize || 100,
      flushIntervalSeconds: flushIntervalSeconds || 30,
      retryAttempts: retryAttempts || 3,
      createdBy: currentUser._id,
    });

    await AuditService.log({
      action: 'CREATE',
      resourceType: 'siem_config',
      resourceId: config._id.toString(),
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ name, destination }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    // Don't return sensitive tokens
    const { splunkToken: _t, ...safe } = config.toObject();
    res.status(201).json({ success: true, data: safe });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'A SIEM config with this name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a SIEM configuration
export const updateConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;
    const updates = req.body;

    const config = await SIEMConfig.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .select('-splunkToken');

    if (!config) {
      res.status(404).json({ success: false, message: 'SIEM config not found' });
      return;
    }

    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'siem_config',
      resourceId: id,
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ name: config.name, updates: Object.keys(updates) }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a SIEM configuration
export const deleteConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;

    const config = await SIEMConfig.findByIdAndDelete(id);
    if (!config) {
      res.status(404).json({ success: false, message: 'SIEM config not found' });
      return;
    }

    await AuditService.log({
      action: 'DELETE',
      resourceType: 'siem_config',
      resourceId: id,
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ name: config.name }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    res.json({ success: true, message: 'SIEM config deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Toggle SIEM config active/inactive
export const toggleConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).user;
    const { id } = req.params;

    const config = await SIEMConfig.findById(id);
    if (!config) {
      res.status(404).json({ success: false, message: 'SIEM config not found' });
      return;
    }

    config.isActive = !config.isActive;
    await config.save();

    await AuditService.log({
      action: 'UPDATE',
      resourceType: 'siem_config',
      resourceId: id,
      username: currentUser.username,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || '',
      details: JSON.stringify({ name: config.name, isActive: config.isActive }),
      severity: 'high',
      outcome: 'SUCCESS',
    });

    res.json({ success: true, data: { isActive: config.isActive } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Test a SIEM connection
export const testConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const config = await SIEMConfig.findById(id);
    if (!config) {
      res.status(404).json({ success: false, message: 'SIEM config not found' });
      return;
    }

    // Send a test event
    const testEvent = {
      timestamp: new Date().toISOString(),
      source: 'FuelOrderSystem',
      type: 'test_connection',
      message: 'SIEM integration test event',
      severity: 'info',
    };

    // For webhook destinations, make a test POST
    if (config.destination === 'webhook' && config.webhookUrl) {
      try {
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.webhookHeaders ? Object.fromEntries(config.webhookHeaders as any) : {}),
          },
          body: JSON.stringify(testEvent),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          res.json({ success: true, message: 'Test event sent successfully' });
        } else {
          res.json({ success: false, message: `Webhook returned status ${response.status}` });
        }
      } catch (fetchError: any) {
        res.json({ success: false, message: `Connection failed: ${fetchError.message}` });
      }
    } else {
      res.json({ success: true, message: 'Configuration validated (live test only for webhook destinations)' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
