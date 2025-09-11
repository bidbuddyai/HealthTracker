import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import type { Activity, Relationship, Wbs } from "@shared/schema";
import { BarChart3, Calendar, AlertCircle, Link2, ArrowRight } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { format, parseISO, differenceInDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from "date-fns";

interface GanttChartProps {
  activities: Activity[];
  relationships: Relationship[];
  wbs: Wbs[];
  onActivitySelect: (activityId: string) => void;
}

export default function GanttChart({ 
  activities, 
  relationships, 
  wbs, 
  onActivitySelect 
}: GanttChartProps) {
  const [hoveredActivity, setHoveredActivity] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [showRelationships, setShowRelationships] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const dayWidth = 32;
  const rowHeight = 42;
  
  // Calculate date range
  const { projectStart, projectEnd, totalDays } = useMemo(() => {
    if (!activities.length) {
      const today = new Date();
      return {
        projectStart: today,
        projectEnd: addDays(today, 60),
        totalDays: 60
      };
    }
    
    // Find min and max dates
    let minDate = new Date();
    let maxDate = new Date();
    let hasValidDates = false;
    
    activities.forEach(activity => {
      if (activity.earlyStart) {
        const startDate = parseISO(activity.earlyStart);
        if (!hasValidDates || startDate < minDate) {
          minDate = startDate;
          hasValidDates = true;
        }
      }
      if (activity.earlyFinish) {
        const endDate = parseISO(activity.earlyFinish);
        if (!hasValidDates || endDate > maxDate) {
          maxDate = endDate;
          hasValidDates = true;
        }
      }
    });
    
    if (!hasValidDates) {
      const today = new Date();
      minDate = today;
      maxDate = addDays(today, 60);
    }
    
    // Add padding
    const start = addDays(minDate, -7);
    const end = addDays(maxDate, 14);
    const days = Math.max(differenceInDays(end, start) + 1, 30);
    
    return {
      projectStart: start,
      projectEnd: end,
      totalDays: days
    };
  }, [activities]);
  
  // Generate calendar headers
  const calendarData = useMemo(() => {
    const days = eachDayOfInterval({ start: projectStart, end: projectEnd });
    const months: Array<{ month: string; startDay: number; days: number }> = [];
    
    let currentMonth = '';
    let monthStartDay = 0;
    let daysInMonth = 0;
    
    days.forEach((day, index) => {
      const monthName = format(day, 'MMM yyyy');
      if (monthName !== currentMonth) {
        if (currentMonth) {
          months.push({ month: currentMonth, startDay: monthStartDay, days: daysInMonth });
        }
        currentMonth = monthName;
        monthStartDay = index;
        daysInMonth = 1;
      } else {
        daysInMonth++;
      }
    });
    
    if (currentMonth) {
      months.push({ month: currentMonth, startDay: monthStartDay, days: daysInMonth });
    }
    
    return {
      days: days.map((day, index) => ({
        date: day,
        dayOfMonth: format(day, 'd'),
        dayOfWeek: format(day, 'EEE'),
        fullDate: format(day, 'MMM d, yyyy'),
        isWeekend: isWeekend(day),
        position: index * dayWidth
      })),
      months
    };
  }, [projectStart, projectEnd, dayWidth]);
  
  // Sort activities by start date and create index map
  const { sortedActivities, activityIndexMap } = useMemo(() => {
    const sorted = [...activities].sort((a, b) => {
      // Critical activities first
      if (a.isCritical !== b.isCritical) {
        return a.isCritical ? -1 : 1;
      }
      if (!a.earlyStart || !b.earlyStart) return 0;
      return parseISO(a.earlyStart).getTime() - parseISO(b.earlyStart).getTime();
    });
    
    const indexMap = new Map<string, number>();
    sorted.forEach((activity, index) => {
      indexMap.set(activity.id, index);
    });
    
    return { sortedActivities: sorted, activityIndexMap: indexMap };
  }, [activities]);
  
  // Calculate activity positions
  const getActivityPosition = (activity: Activity) => {
    if (!activity.earlyStart || !activity.earlyFinish) {
      return null;
    }
    
    const start = parseISO(activity.earlyStart);
    const end = parseISO(activity.earlyFinish);
    const leftOffset = differenceInDays(start, projectStart);
    const duration = differenceInDays(end, start) + 1;
    
    return {
      left: leftOffset * dayWidth,
      width: Math.max(duration * dayWidth - 2, 20),
      duration
    };
  };
  
  // Get activity color
  const getActivityStyle = (activity: Activity) => {
    let backgroundColor = '#9ca3af'; // Default gray
    
    if (selectedActivity === activity.id) {
      backgroundColor = '#f59e0b'; // Amber when selected
    } else if (activity.isCritical) {
      backgroundColor = '#dc2626'; // Red
    } else if (activity.status === 'Completed') {
      backgroundColor = '#16a34a'; // Green
    } else if (activity.status === 'InProgress') {
      backgroundColor = '#2563eb'; // Blue
    }
    
    return { backgroundColor };
  };
  
  // Get predecessors and successors for an activity
  const getActivityRelationships = (activityId: string) => {
    const predecessors = relationships
      .filter(r => r.successorId === activityId)
      .map(r => {
        const pred = activities.find(a => a.id === r.predecessorId);
        return pred ? { ...r, activity: pred } : null;
      })
      .filter(Boolean);
    
    const successors = relationships
      .filter(r => r.predecessorId === activityId)
      .map(r => {
        const succ = activities.find(a => a.id === r.successorId);
        return succ ? { ...r, activity: succ } : null;
      })
      .filter(Boolean);
    
    return { predecessors, successors };
  };
  
  // Render relationship lines
  const renderRelationshipLines = () => {
    if (!showRelationships) return null;
    
    console.log('Rendering relationships:', relationships.length, 'relationships');
    console.log('Activity map size:', activityIndexMap.size);
    
    return relationships.map(rel => {
      const predIndex = activityIndexMap.get(rel.predecessorId);
      const succIndex = activityIndexMap.get(rel.successorId);
      
      if (predIndex === undefined || succIndex === undefined) return null;
      
      const predecessor = sortedActivities[predIndex];
      const successor = sortedActivities[succIndex];
      
      const predPos = getActivityPosition(predecessor);
      const succPos = getActivityPosition(successor);
      
      if (!predPos || !succPos) {
        console.log('Missing position for relationship:', rel.id, 'pred:', predPos, 'succ:', succPos);
        return null;
      }
      
      // Calculate connection points
      let x1 = predPos.left + predPos.width;
      let y1 = predIndex * rowHeight + rowHeight / 2;
      let x2 = succPos.left;
      let y2 = succIndex * rowHeight + rowHeight / 2;
      
      // Adjust for relationship type
      if (rel.type === 'SS') {
        x1 = predPos.left;
        x2 = succPos.left;
      } else if (rel.type === 'FF') {
        x1 = predPos.left + predPos.width;
        x2 = succPos.left + succPos.width;
      } else if (rel.type === 'SF') {
        x1 = predPos.left;
        x2 = succPos.left + succPos.width;
      }
      
      // Add lag adjustment
      if (rel.lag) {
        x2 += rel.lag * dayWidth;
      }
      
      // Create path - use straight lines with right angles for clarity
      let path = '';
      const isCritical = predecessor.isCritical && successor.isCritical;
      const color = isCritical ? '#dc2626' : '#6b7280';
      
      if (Math.abs(y2 - y1) < 5) {
        // Same row - straight line
        path = `M ${x1} ${y1} L ${x2} ${y2}`;
      } else {
        // Different rows - use right angles
        const midX = x1 + 15;
        path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
      }
      
      return (
        <g key={rel.id}>
          {/* Main line */}
          <path
            d={path}
            stroke={color}
            strokeWidth="2"
            fill="none"
            strokeDasharray={rel.type !== 'FS' ? '4,4' : undefined}
            opacity={hoveredActivity && hoveredActivity !== rel.predecessorId && hoveredActivity !== rel.successorId ? 0.3 : 1}
          />
          {/* Arrow head */}
          <path
            d={`M ${x2} ${y2} L ${x2-8} ${y2-4} L ${x2-8} ${y2+4} Z`}
            fill={color}
            opacity={hoveredActivity && hoveredActivity !== rel.predecessorId && hoveredActivity !== rel.successorId ? 0.3 : 1}
          />
          {/* Lag label */}
          {rel.lag !== 0 && (
            <text
              x={x1 + 20}
              y={y1 - 5}
              fontSize="11"
              fill="#4b5563"
              fontWeight="500"
            >
              {(rel.lag || 0) > 0 ? `+${rel.lag || 0}d` : `${rel.lag || 0}d`}
            </text>
          )}
        </g>
      );
    });
  };
  
  return (
    <TooltipProvider>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              <span>Gantt Chart</span>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant={showRelationships ? "default" : "outline"}
                size="sm"
                onClick={() => setShowRelationships(!showRelationships)}
                className="text-xs"
              >
                <Link2 className="w-4 h-4 mr-1" />
                {showRelationships ? 'Hide' : 'Show'} Links
              </Button>
              <div className="flex items-center gap-3 text-sm font-normal">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-red-600 rounded" />
                  <span>Critical</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-600 rounded" />
                  <span>In Progress</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-600 rounded" />
                  <span>Complete</span>
                </div>
                <span className="text-gray-500 ml-2">{activities.length} activities</span>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activities.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p>No activities to display</p>
              <p className="text-sm mt-2">Generate a schedule to see the Gantt chart</p>
            </div>
          ) : (
            <div className="flex border-t">
              {/* Activity List */}
              <div className="w-[450px] border-r bg-gray-50 flex-shrink-0">
                <div className="sticky top-0 bg-white border-b px-4 py-2 font-medium text-sm z-20">
                  <div className="flex justify-between">
                    <span>Activity</span>
                    <span>Links</span>
                  </div>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
                  {sortedActivities.map((activity, index) => {
                    const { predecessors, successors } = getActivityRelationships(activity.id);
                    
                    return (
                      <div
                        key={activity.id}
                        className={`px-4 py-2 border-b text-sm cursor-pointer transition-colors ${
                          selectedActivity === activity.id ? 'bg-amber-50 border-amber-200' :
                          hoveredActivity === activity.id ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                        }`}
                        style={{ minHeight: rowHeight }}
                        onClick={() => {
                          setSelectedActivity(activity.id);
                          onActivitySelect(activity.id);
                        }}
                        onMouseEnter={() => setHoveredActivity(activity.id)}
                        onMouseLeave={() => setHoveredActivity(null)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {activity.isCritical && (
                                <AlertCircle className="w-3 h-3 text-red-600 flex-shrink-0" />
                              )}
                              <span className="font-mono text-xs text-gray-500">
                                {activity.activityId}
                              </span>
                              <span className="font-medium truncate max-w-[200px]" title={activity.name}>
                                {activity.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                              <span>{activity.originalDuration}d</span>
                              {activity.earlyStart && (
                                <span>{format(parseISO(activity.earlyStart), 'MMM d')}</span>
                              )}
                              {(activity.percentComplete || 0) > 0 && (
                                <span className="text-green-600 font-medium">
                                  {activity.percentComplete || 0}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            {predecessors.length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded">
                                    <ArrowRight className="w-3 h-3 rotate-180" />
                                    <span>{predecessors.length}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">
                                    <div className="font-medium mb-1">Predecessors:</div>
                                    {predecessors.map((p: any) => (
                                      <div key={p.id}>
                                        {p.activity.activityId}: {p.activity.name} ({p.type}{p.lag ? ` ${p.lag}d` : ''})
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {successors.length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded">
                                    <ArrowRight className="w-3 h-3" />
                                    <span>{successors.length}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">
                                    <div className="font-medium mb-1">Successors:</div>
                                    {successors.map((s: any) => (
                                      <div key={s.id}>
                                        {s.activity.activityId}: {s.activity.name} ({s.type}{s.lag ? ` ${s.lag}d` : ''})
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Gantt Chart Area */}
              <div className="flex-1 overflow-hidden">
                <div className="sticky top-0 bg-white z-10">
                  {/* Month headers */}
                  <div className="flex border-b">
                    {calendarData.months.map((month, idx) => (
                      <div
                        key={idx}
                        className="border-r text-xs font-medium px-2 py-1 bg-gray-50"
                        style={{ width: month.days * dayWidth }}
                      >
                        {month.month}
                      </div>
                    ))}
                  </div>
                  {/* Day headers */}
                  <div className="flex border-b">
                    {calendarData.days.map((day, idx) => (
                      <div
                        key={idx}
                        className={`border-r text-xs text-center py-1 ${
                          day.isWeekend ? 'bg-gray-100' : ''
                        }`}
                        style={{ width: dayWidth }}
                        title={day.fullDate}
                      >
                        <div className="text-[10px] text-gray-400">{day.dayOfWeek[0]}</div>
                        <div className="font-medium">{day.dayOfMonth}</div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <ScrollArea className="w-full">
                  <div 
                    className="relative"
                    style={{ 
                      width: totalDays * dayWidth,
                      minHeight: sortedActivities.length * rowHeight 
                    }}
                  >
                    {/* Weekend backgrounds */}
                    {calendarData.days.filter(d => d.isWeekend).map((day, idx) => (
                      <div
                        key={`weekend-${idx}`}
                        className="absolute top-0 bottom-0 bg-gray-50 opacity-50"
                        style={{ 
                          left: day.position, 
                          width: dayWidth,
                          height: sortedActivities.length * rowHeight
                        }}
                      />
                    ))}
                    
                    {/* Grid lines for rows */}
                    {sortedActivities.map((_, index) => (
                      <div
                        key={`gridline-${index}`}
                        className="absolute w-full border-b border-gray-100"
                        style={{ 
                          top: (index + 1) * rowHeight - 1,
                          left: 0,
                          right: 0
                        }}
                      />
                    ))}
                    
                    {/* Relationship lines */}
                    <svg 
                      ref={svgRef}
                      className="absolute top-0 left-0"
                      style={{ 
                        width: totalDays * dayWidth,
                        height: sortedActivities.length * rowHeight,
                        pointerEvents: 'none',
                        zIndex: 5
                      }}
                    >
                      {renderRelationshipLines()}
                    </svg>
                    
                    {/* Activity bars */}
                    {sortedActivities.map((activity, index) => {
                      const position = getActivityPosition(activity);
                      if (!position) return null;
                      
                      const barTop = index * rowHeight + 9;
                      const barHeight = 24;
                      const style = getActivityStyle(activity);
                      const isSelected = selectedActivity === activity.id;
                      const isHovered = hoveredActivity === activity.id;
                      
                      return (
                        <Tooltip key={activity.id}>
                          <TooltipTrigger asChild>
                            <div
                              className={`absolute rounded cursor-pointer transition-all ${
                                isSelected ? 'ring-2 ring-amber-500 ring-offset-1' : ''
                              } ${isHovered ? 'shadow-lg' : 'shadow'}`}
                              style={{
                                left: position.left,
                                top: barTop,
                                width: activity.originalDuration === 0 ? barHeight : position.width,
                                height: barHeight,
                                ...style,
                                zIndex: isSelected || isHovered ? 20 : 10,
                                transform: activity.originalDuration === 0 ? 'rotate(45deg)' : undefined
                              }}
                              onClick={() => {
                                setSelectedActivity(activity.id);
                                onActivitySelect(activity.id);
                              }}
                              onMouseEnter={() => setHoveredActivity(activity.id)}
                              onMouseLeave={() => setHoveredActivity(null)}
                            >
                              {(activity.percentComplete || 0) > 0 && activity.originalDuration !== 0 && (
                                <div
                                  className="absolute top-0 left-0 h-full bg-black bg-opacity-25 rounded"
                                  style={{ width: `${activity.percentComplete || 0}%` }}
                                />
                              )}
                              {position.width > 50 && activity.originalDuration !== 0 && (
                                <div className="px-1 text-white text-xs font-medium truncate leading-6">
                                  {activity.activityId}
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="space-y-1 text-sm">
                              <div className="font-bold">{activity.name}</div>
                              <div className="text-xs space-y-0.5">
                                <div>ID: {activity.activityId} | Duration: {activity.originalDuration}d</div>
                                <div>
                                  Start: {activity.earlyStart && format(parseISO(activity.earlyStart), 'MMM d, yyyy')}
                                </div>
                                <div>
                                  Finish: {activity.earlyFinish && format(parseISO(activity.earlyFinish), 'MMM d, yyyy')}
                                </div>
                                {activity.totalFloat !== undefined && (
                                  <div>Float: {activity.totalFloat}d</div>
                                )}
                                {(activity.percentComplete || 0) > 0 && (
                                  <div className="text-green-600">Progress: {activity.percentComplete || 0}%</div>
                                )}
                                {activity.isCritical && (
                                  <div className="text-red-600 font-medium">Critical Path Activity</div>
                                )}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}