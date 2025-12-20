import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, Upload, FileText, RefreshCw, AlertCircle, Plus, Sparkles, FileUp, Download, FileOutput } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import InteractiveScheduleCreator from "./InteractiveScheduleCreator";
import type { ProjectSchedule, ScheduleActivity } from "@shared/schema";

interface ScheduleManagerProps {
  projectId: string;
  meetingId?: string;
}

export default function ScheduleManager({ projectId, meetingId }: ScheduleManagerProps) {
  const { toast } = useToast();
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [uploadType, setUploadType] = useState<"CPM" | "3_WEEK_LOOKAHEAD">("CPM");
  const [fileContent, setFileContent] = useState<string>("");
  
  // Fetch schedules
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<ProjectSchedule[]>({
    queryKey: ["/api/projects", projectId, "schedules"],
  });
  
  // Fetch activities for selected schedule
  const { data: activities = [], isLoading: activitiesLoading } = useQuery<ScheduleActivity[]>({
    queryKey: ["/api/schedules", selectedSchedule, "activities"],
    enabled: !!selectedSchedule,
  });
  
  // Import schedule mutation
  const uploadScheduleMutation = useMutation({
    mutationFn: async (data: any) => {
      const endpoint = data.filename ? 
        `/api/projects/${projectId}/schedules/import` : 
        `/api/projects/${projectId}/schedules/upload`;
      const response = await apiRequest("POST", endpoint, data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
      setShowUploadDialog(false);
      setFileContent("");
      setFilename("");
      toast({
        title: "Schedule imported",
        description: data.summary || `Successfully imported ${data.activitiesCount || 0} activities.`,
      });
      if (data.schedule?.id) {
        setSelectedSchedule(data.schedule.id);
      }
    },
    onError: () => {
      toast({
        title: "Upload failed", 
        description: "Failed to process the schedule file.",
        variant: "destructive",
      });
    },
  });
  
  // Generate lookahead mutation
  const generateLookaheadMutation = useMutation({
    mutationFn: async (baseScheduleId: string) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/schedules/generate-lookahead`, {
        baseScheduleId,
        startDate: new Date().toISOString().split('T')[0]
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
      toast({
        title: "Lookahead generated",
        description: "3-week lookahead has been created from the CPM schedule.",
      });
    },
  });
  
  // Update schedule from meeting
  const updateFromMeetingMutation = useMutation({
    mutationFn: async () => {
      if (!meetingId) return;
      const response = await apiRequest("POST", `/api/meetings/${meetingId}/update-schedule`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({
        title: "Schedule updated",
        description: `Applied ${data?.appliedUpdates || 0} updates from meeting discussion.`,
      });
    },
  });
  
  const [filename, setFilename] = useState<string>("");
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFilename(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setFileContent(event.target?.result as string);
      };
      // For binary files like MPP, read as text with fallback encoding
      if (file.name.toLowerCase().endsWith('.mpp')) {
        reader.readAsText(file, 'latin1');
      } else {
        reader.readAsText(file);
      }
    }
  };
  
  const handleScheduleImport = () => {
    if (!fileContent || !filename) {
      toast({
        title: "No file selected",
        description: "Please select a schedule file to import.",
        variant: "destructive",
      });
      return;
    }
    
    // Use the import endpoint for P6/MSP files
    uploadScheduleMutation.mutate({
      fileContent,
      filename
    });
  };
  
  const handleScheduleUpload = handleScheduleImport; // For backward compatibility
  
  const handleExportSchedule = async (_scheduleId: string, format: 'pdf' | 'xml' | 'xer' | 'csv' | 'json') => {
    try {
      // Use project-level export endpoint which exports all project activities
      const response = await fetch(`/api/projects/${projectId}/export/${format}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(errorData.error || 'Export failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Use Content-Disposition header for filename if available
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `schedule_export.${format}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/"/g, '');
        }
      }
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      // If it's PDF (HTML), we need to inform user to print as PDF
      if (format === 'pdf') {
        toast({
          title: "Schedule exported",
          description: "HTML report downloaded. Open it and print/save as PDF for best results.",
        });
      } else {
        toast({
          title: "Schedule exported",
          description: `Schedule exported as ${format.toUpperCase()} successfully.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Failed to export schedule. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const cpmSchedules = schedules.filter(s => s.scheduleType === "CPM");
  const lookaheadSchedules = schedules.filter(s => s.scheduleType === "3_WEEK_LOOKAHEAD");
  const currentSchedule = schedules.find(s => s.id === selectedSchedule);
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Schedule Management
            </CardTitle>
            <div className="flex gap-2">
              {meetingId && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => updateFromMeetingMutation.mutate()}
                  disabled={updateFromMeetingMutation.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Update from Meeting
                </Button>
              )}
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="default">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Create with AI
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Interactive CPM Schedule Creator</DialogTitle>
                  </DialogHeader>
                  <InteractiveScheduleCreator 
                    projectId={projectId}
                    onScheduleCreated={(scheduleId) => {
                      setShowCreateDialog(false);
                      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
                      setSelectedSchedule(scheduleId);
                    }}
                  />
                </DialogContent>
              </Dialog>
              <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <FileUp className="h-4 w-4 mr-2" />
                    Import P6/MSP
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Import Schedule File</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium mb-2">Supported Formats:</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• <strong>XER</strong> - Primavera P6 native format</li>
                        <li>• <strong>XML/MSPDI</strong> - MS Project XML format</li>
                        <li>• <strong>MPP</strong> - MS Project native format</li>
                        <li>• <strong>PDF</strong> - Schedule reports from P6/MSP</li>
                      </ul>
                    </div>
                    <div>
                      <Label htmlFor="schedule-file">Select Schedule File</Label>
                      <input
                        id="schedule-file"
                        type="file"
                        accept=".xer,.xml,.mspdi,.mpx,.mpp,.pdf"
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-md file:border-0
                          file:text-sm file:font-semibold
                          file:bg-brand-primary file:text-white
                          hover:file:bg-brand-secondary"
                      />
                    </div>
                    {fileContent && (
                      <div className="text-sm text-gray-600">
                        File loaded: {fileContent.length.toLocaleString()} characters
                      </div>
                    )}
                    <Button 
                      onClick={handleScheduleImport}
                      disabled={!fileContent || uploadScheduleMutation.isPending}
                      className="w-full"
                    >
                      {uploadScheduleMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Importing Schedule...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Import Schedule
                        </>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="cpm">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="cpm">
                CPM Schedules ({cpmSchedules.length})
              </TabsTrigger>
              <TabsTrigger value="lookahead">
                3-Week Lookaheads ({lookaheadSchedules.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="cpm" className="space-y-4">
              {cpmSchedules.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No CPM schedules uploaded yet</p>
                  <p className="text-sm mt-1">Upload your project CPM schedule to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cpmSchedules.map((schedule) => (
                    <Card key={schedule.id} className="cursor-pointer hover:bg-gray-50"
                          onClick={() => setSelectedSchedule(schedule.id)}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">Version {schedule.version}</div>
                            <div className="text-sm text-gray-500">
                              Data Date: {schedule.dataDate} | {schedule.startDate} to {schedule.finishDate}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">CPM</Badge>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  generateLookaheadMutation.mutate(schedule.id);
                                }}
                                disabled={generateLookaheadMutation.isPending}
                              >
                                Generate Lookahead
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Export as PDF"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportSchedule(schedule.id, 'pdf');
                                }}
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Export as MS Project XML"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportSchedule(schedule.id, 'xml');
                                }}
                              >
                                <FileOutput className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Export as Primavera XER"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportSchedule(schedule.id, 'xer');
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="lookahead" className="space-y-4">
              {lookaheadSchedules.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No 3-week lookaheads created yet</p>
                  <p className="text-sm mt-1">Generate from a CPM schedule or upload directly</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lookaheadSchedules.map((schedule) => (
                    <Card key={schedule.id} className="cursor-pointer hover:bg-gray-50"
                          onClick={() => setSelectedSchedule(schedule.id)}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">
                              {schedule.startDate} to {schedule.finishDate}
                            </div>
                            <div className="text-sm text-gray-500">
                              Data Date: {schedule.dataDate}
                            </div>
                          </div>
                          <Badge variant="outline">3-Week</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Activities View */}
      {currentSchedule && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Schedule Activities - {currentSchedule.scheduleType === "CPM" ? "CPM" : "3-Week Lookahead"}
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportSchedule(currentSchedule.id, 'pdf')}
                  title="Export as PDF Report"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportSchedule(currentSchedule.id, 'xml')}
                  title="Export as MS Project XML"
                >
                  <FileOutput className="h-4 w-4 mr-2" />
                  MSP
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExportSchedule(currentSchedule.id, 'xer')}
                  title="Export as Primavera P6 XER"
                >
                  <Download className="h-4 w-4 mr-2" />
                  XER
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activitiesLoading ? (
              <div className="text-center py-8">Loading activities...</div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No activities found in this schedule</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Finish</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {activities.slice(0, 10).map((activity) => (
                      <tr key={activity.id}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">
                          {activity.activityId}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {activity.activityName}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {activity.startDate}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {activity.finishDate}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {activity.remainingDuration}d
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={
                            activity.status === "Completed" ? "default" :
                            activity.status === "In Progress" ? "secondary" : "outline"
                          }>
                            {activity.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activities.length > 10 && (
                  <div className="text-center py-2 text-sm text-gray-500">
                    Showing 10 of {activities.length} activities
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}