/**
 * Security Incident Controller
 *
 * Full incident lifecycle: create, list, update status, assign,
 * add notes, link alerts/events, resolve with root cause.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SecurityIncident } from '../models/SecurityIncident';
import { SecurityAlert } from '../models/SecurityAlert';

/* ── helpers ── */

async function nextIncidentId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INC-${year}-`;
  const last = await SecurityIncident.findOne({ incidentId: { $regex: `^${prefix}` } })
    .sort({ incidentId: -1 })
    .select('incidentId')
    .lean();
  const seq = last ? parseInt(last.incidentId.replace(prefix, ''), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/* ── endpoints ── */

/**
 * GET / — paginated incident list
 */
export async function getIncidents(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',');
      filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    if (req.query.severity) filter.severity = req.query.severity;

    const [incidents, total] = await Promise.all([
      SecurityIncident.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SecurityIncident.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: { incidents, total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch incidents', error: error.message });
  }
}

/**
 * GET /stats — incident overview stats
 */
export async function getIncidentStats(_req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const [open, investigating, resolvedThisWeek, all] = await Promise.all([
      SecurityIncident.countDocuments({ status: { $in: ['new', 'acknowledged'] } }),
      SecurityIncident.countDocuments({ status: 'investigating' }),
      SecurityIncident.countDocuments({
        status: { $in: ['resolved', 'false_positive'] },
        resolvedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
      SecurityIncident.countDocuments(),
    ]);

    // Calculate MTTR for resolved incidents in the last 30 days
    const resolved = await SecurityIncident.find({
      status: { $in: ['resolved', 'false_positive'] },
      resolvedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }).select('createdAt resolvedAt').lean();

    let mttrHours = 0;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((sum, inc) => {
        return sum + (new Date(inc.resolvedAt!).getTime() - new Date(inc.createdAt).getTime());
      }, 0);
      mttrHours = Math.round((totalMs / resolved.length / 3600000) * 10) / 10;
    }

    return res.json({
      success: true,
      data: { open, investigating, resolvedThisWeek, total: all, mttrHours },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch stats', error: error.message });
  }
}

/**
 * GET /:id — single incident detail
 */
export async function getIncidentById(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const incident = await SecurityIncident.findById(req.params.id).lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    return res.json({ success: true, data: incident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch incident', error: error.message });
  }
}

/**
 * POST / — create incident manually
 */
export async function createIncident(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { title, description, severity, assignedTo, linkedAlerts, linkedEvents } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (severity && !validSeverities.includes(severity)) {
      return res.status(400).json({ success: false, message: 'Invalid severity' });
    }

    const incidentId = await nextIncidentId();
    const incident = await SecurityIncident.create({
      incidentId,
      title: title.trim(),
      description: description?.trim() || '',
      severity: severity || 'medium',
      assignedTo: assignedTo || undefined,
      linkedAlerts: Array.isArray(linkedAlerts) ? linkedAlerts : [],
      linkedEvents: Array.isArray(linkedEvents) ? linkedEvents : [],
      createdBy: req.user?.username || 'unknown',
    });

    return res.status(201).json({ success: true, data: incident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to create incident', error: error.message });
  }
}

/**
 * POST /from-alert/:alertId — create incident from an existing alert
 */
export async function createFromAlert(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const alert = await SecurityAlert.findById(req.params.alertId).lean();
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    const incidentId = await nextIncidentId();
    const incident = await SecurityIncident.create({
      incidentId,
      title: alert.title,
      description: alert.message,
      severity: alert.severity,
      linkedAlerts: [alert._id.toString()],
      linkedEvents: alert.relatedEventId ? [alert.relatedEventId] : [],
      createdBy: req.user?.username || 'unknown',
      notes: [{
        author: req.user?.username || 'system',
        authorId: req.user?.userId || '',
        text: `Incident created from alert: ${alert.title}`,
        createdAt: new Date(),
      }],
    });

    // Update alert status to investigating
    await SecurityAlert.findByIdAndUpdate(req.params.alertId, {
      status: 'investigating',
      acknowledgedBy: req.user?.username,
      acknowledgedAt: new Date(),
    });

    return res.status(201).json({ success: true, data: incident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to create incident from alert', error: error.message });
  }
}

/**
 * PATCH /:id/status — update status (acknowledge, investigate, resolve, escalate)
 */
export async function updateStatus(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { status } = req.body;
    const validStatuses = ['new', 'acknowledged', 'investigating', 'resolved', 'false_positive', 'escalated'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const update: Record<string, any> = { status };
    const username = req.user?.username || 'unknown';

    if (status === 'acknowledged') {
      update.acknowledgedBy = username;
      update.acknowledgedAt = new Date();
    } else if (status === 'resolved' || status === 'false_positive') {
      update.resolvedBy = username;
      update.resolvedAt = new Date();
    }

    const incident = await SecurityIncident.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    return res.json({ success: true, data: incident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
}

/**
 * PATCH /:id/assign — assign incident to an admin
 */
export async function assignIncident(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { assignedTo } = req.body;
    if (!assignedTo || typeof assignedTo !== 'string') {
      return res.status(400).json({ success: false, message: 'assignedTo is required' });
    }

    const incident = await SecurityIncident.findByIdAndUpdate(
      req.params.id,
      { assignedTo: assignedTo.trim() },
      { new: true },
    ).lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    return res.json({ success: true, data: incident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to assign', error: error.message });
  }
}

/**
 * POST /:id/note — add investigation note
 */
export async function addNote(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Note text is required' });
    }
    if (text.length > 2000) {
      return res.status(400).json({ success: false, message: 'Note must be 2000 characters or less' });
    }

    const incident = await SecurityIncident.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          notes: {
            author: req.user?.username || 'unknown',
            authorId: req.user?.userId || '',
            text: text.trim(),
            createdAt: new Date(),
          },
        },
      },
      { new: true },
    ).lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    return res.json({ success: true, data: incident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to add note', error: error.message });
  }
}

/**
 * POST /:id/link — link an alert or event
 */
export async function linkEvidence(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { alertId, eventId } = req.body;
    const update: Record<string, any> = {};
    if (alertId) update.$addToSet = { ...update.$addToSet, linkedAlerts: alertId };
    if (eventId) update.$addToSet = { ...update.$addToSet, linkedEvents: eventId };

    if (!alertId && !eventId) {
      return res.status(400).json({ success: false, message: 'alertId or eventId required' });
    }

    const incident = await SecurityIncident.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    return res.json({ success: true, data: incident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to link evidence', error: error.message });
  }
}

/**
 * PATCH /:id/root-cause — set root cause & impact assessment
 */
export async function setRootCause(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const { rootCause, impactAssessment } = req.body;
    const update: Record<string, any> = {};
    if (rootCause !== undefined) update.rootCause = rootCause;
    if (impactAssessment !== undefined) update.impactAssessment = impactAssessment;

    const incident = await SecurityIncident.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    return res.json({ success: true, data: incident });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update', error: error.message });
  }
}
