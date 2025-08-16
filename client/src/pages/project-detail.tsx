import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Project, Activity, Wbs, Relationship, Calendar } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Circle, 
  PlayCircle,
  Users,
  BarChart3,
  GitBranch,
  Target,
  Settings
} from "lucide-react";
import ScheduleGrid from "@/components/ScheduleGrid";
import GanttChart from "@/components/GanttChart";
import ActivityDialog from "@/components/ActivityDialog";
import WBSTree from "@/components/WBSTree";
import CalendarManager from "@/components/CalendarManager";
import BaselineManager from "@/components/BaselineManager";
import VarianceTracker from "@/components/VarianceTracker";
import TIAManager from "@/components/TIAManager";
import ConstraintManager from "@/components/ConstraintManager";
import ProgressTracker from "@/components/ProgressTracker";

export default function ProjectDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("schedule");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showActivityDialog, setShowActivityDialog] = useState(false);

  // Data queries
  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<Activity[]>({
    queryKey: ["/api/projects", id, "activities"],
  });

  const { data: relationships = [], isLoading: relationshipsLoading } = useQuery<Relationship[]>({
    queryKey: ["/api/projects", id, "relationships"],
  });

  const { data: wbs = [], isLoading: wbsLoading } = useQuery<Wbs[]>({
    queryKey: ["/api/projects", id, "wbs"],
  });

  const { data: calendars = [], isLoading: calendarsLoading } = useQuery<Calendar[]>({
    queryKey: ["/api/projects", id, "calendars"],
  });

  // Calculate critical path mutation
  const calculateCriticalPathMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/projects/${id}/calculate-critical-path`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "activities"] });
      toast({
        title: "Critical Path Calculated",
        description: "The schedule has been recalculated with the latest activity data.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to calculate critical path. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (projectLoading || activitiesLoading || relationshipsLoading || wbsLoading || calendarsLoading) {
    return (
      <Layout>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="space-y-6">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 space-y-4">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-96 w-full rounded-lg" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </main>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Project not found</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">The requested project could not be found.</p>
                <Link href="/projects">
                  <Button>Back to Projects</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </main>
      </Layout>
    );
  }

  // Calculate project statistics
  const totalActivities = activities.length;
  const completedActivities = activities.filter(a => a.status === "Completed").length;
  const inProgressActivities = activities.filter(a => a.status === "InProgress").length;
  const criticalActivities = activities.filter(a => a.isCritical).length;
  const constrainedActivities = activities.filter(a => a.constraintType && a.constraintDate).length;
  const projectProgress = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;

  // Find project start and finish dates
  const projectStartDate = activities.reduce((earliest, activity) => {
    if (!activity.earlyStart) return earliest;
    if (!earliest || new Date(activity.earlyStart) < new Date(earliest)) {
      return activity.earlyStart;
    }
    return earliest;
  }, null as string | null);

  const projectFinishDate = activities.reduce((latest, activity) => {
    if (!activity.earlyFinish) return latest;
    if (!latest || new Date(activity.earlyFinish) > new Date(latest)) {
      return activity.earlyFinish;
    }
    return latest;
  }, null as string | null);

  const handleActivitySelect = (activityId: string) => {
    setSelectedActivityId(activityId);
    setShowActivityDialog(true);
  };

  const handleNewActivity = () => {
    setSelectedActivityId(null);
    setShowActivityDialog(true);
  };

  return (
    <Layout>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="space-y-6">
          {/* Project Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/projects" className="hover:text-gray-700 dark:hover:text-gray-200">
                Projects
              </Link>
              <span>›</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{project.name}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                onClick={() => calculateCriticalPathMutation.mutate()}
                disabled={calculateCriticalPathMutation.isPending}
                size="sm"
                data-testid="button-calculate-critical-path"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                {calculateCriticalPathMutation.isPending ? "Calculating..." : "Update CPM"}
              </Button>
              <Button onClick={handleNewActivity} size="sm" data-testid="button-new-activity">
                <Circle className="w-4 h-4 mr-2" />
                New Activity
              </Button>
            </div>
          </div>

          {/* Project Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Progress</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{projectProgress}%</p>
                  </div>
                  <div className="h-8 w-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <Progress value={projectProgress} className="mt-2" />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {completedActivities} of {totalActivities} activities complete
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">In Progress</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{inProgressActivities}</p>
                  </div>
                  <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                    <PlayCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Activities currently active</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Critical Path</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{criticalActivities}</p>
                  </div>
                  <div className="h-8 w-8 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Critical activities</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Duration</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {projectStartDate && projectFinishDate ? 
                        Math.ceil((new Date(projectFinishDate).getTime() - new Date(projectStartDate).getTime()) / (1000 * 60 * 60 * 24)) + ' days'
                        : 'TBD'
                      }
                    </p>
                  </div>
                  <div className="h-8 w-8 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                    <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {projectStartDate && projectFinishDate ? 
                    `${new Date(projectStartDate).toLocaleDateString()} - ${new Date(projectFinishDate).toLocaleDateString()}`
                    : 'Schedule calculation needed'
                  }
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Project Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <span>{project.name}</span>
                {constrainedActivities > 0 && (
                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                    <Target className="w-3 h-3 mr-1" />
                    {constrainedActivities} Constrained
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Description</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {project.description || "No description provided"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Contract Period</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {project.contractStartDate && project.contractFinishDate ? 
                      `${new Date(project.contractStartDate).toLocaleDateString()} - ${new Date(project.contractFinishDate).toLocaleDateString()}`
                      : 'Not specified'
                    }
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Data Date</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {project.dataDate ? new Date(project.dataDate).toLocaleDateString() : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Tabs Interface */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="schedule" className="flex items-center space-x-1">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Schedule</span>
              </TabsTrigger>
              <TabsTrigger value="gantt" className="flex items-center space-x-1">
                <GitBranch className="w-4 h-4" />
                <span className="hidden sm:inline">Gantt</span>
              </TabsTrigger>
              <TabsTrigger value="wbs" className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">WBS</span>
              </TabsTrigger>
              <TabsTrigger value="calendars" className="flex items-center space-x-1">
                <CalendarIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Calendars</span>
              </TabsTrigger>
              <TabsTrigger value="baselines" className="flex items-center space-x-1">
                <Target className="w-4 h-4" />
                <span className="hidden sm:inline">Baselines</span>
              </TabsTrigger>
              <TabsTrigger value="variance" className="flex items-center space-x-1">
                <AlertTriangle className="w-4 h-4" />
                <span className="hidden sm:inline">Variance</span>
              </TabsTrigger>
              <TabsTrigger value="tia" className="flex items-center space-x-1">
                <AlertTriangle className="w-4 h-4" />
                <span className="hidden sm:inline">TIA</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center space-x-1">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="schedule" className="space-y-4">
              <ScheduleGrid 
                activities={activities}
                relationships={relationships}
                wbs={wbs}
                onActivitySelect={handleActivitySelect}
                onNewActivity={handleNewActivity}
              />
            </TabsContent>

            <TabsContent value="gantt" className="space-y-4">
              <GanttChart 
                activities={activities}
                relationships={relationships}
                wbs={wbs}
                onActivitySelect={handleActivitySelect}
              />
            </TabsContent>

            <TabsContent value="wbs" className="space-y-4">
              <WBSTree 
                wbs={wbs}
                activities={activities}
                projectId={id!}
              />
            </TabsContent>

            <TabsContent value="calendars" className="space-y-4">
              <CalendarManager 
                calendars={calendars}
                projectId={id!}
              />
            </TabsContent>

            <TabsContent value="baselines" className="space-y-4">
              <BaselineManager 
                projectId={id!}
              />
            </TabsContent>

            <TabsContent value="variance" className="space-y-4">
              <VarianceTracker 
                projectId={id!}
                activities={activities}
              />
            </TabsContent>

            <TabsContent value="tia" className="space-y-4">
              <TIAManager 
                projectId={id!}
                activities={activities}
                relationships={relationships}
              />
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ConstraintManager 
                  activities={activities}
                  projectId={id!}
                />
                <ProgressTracker 
                  project={project}
                  activities={activities}
                  projectId={id!}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Activity Dialog */}
        <ActivityDialog
          open={showActivityDialog}
          onOpenChange={setShowActivityDialog}
          activityId={selectedActivityId}
          projectId={id!}
          wbs={wbs}
          calendars={calendars}
          activities={activities}
        />
      </main>
    </Layout>
  );
}