import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams } from "wouter";
import { Calendar, CalendarWeekPattern, CalendarException, CalendarShift } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarIcon, Clock, Calendar as CalendarIco, AlertCircle, Settings, Plus, Edit, Trash2, CalendarDays, CalendarClock } from "lucide-react";

const createCalendarSchema = z.object({
  name: z.string().min(1, "Calendar name is required"),
  type: z.enum(["Global", "Project", "Resource", "Activity"]),
  description: z.string().optional(),
  workDaysPerWeek: z.number().min(1).max(7),
  workHoursPerDay: z.number().min(1).max(24),
  isDefault: z.boolean().optional()
});

const createExceptionSchema = z.object({
  exceptionDate: z.string().min(1, "Date is required"),
  exceptionType: z.enum(["Holiday", "NonWorkingDay", "ModifiedHours"]),
  name: z.string().optional(),
  isRecurring: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional()
});

const createShiftSchema = z.object({
  name: z.string().min(1, "Shift name is required"),
  code: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  breakStartTime: z.string().optional(),
  breakEndTime: z.string().optional(),
  workHours: z.number().optional(),
  color: z.string().optional()
});

export default function CalendarsPage() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [selectedCalendar, setSelectedCalendar] = useState<Calendar | null>(null);
  const [isCalendarDialogOpen, setIsCalendarDialogOpen] = useState(false);
  const [isExceptionDialogOpen, setIsExceptionDialogOpen] = useState(false);
  const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);

  // Fetch calendars
  const { data: calendars = [], isLoading: calendarsLoading } = useQuery<Calendar[]>({
    queryKey: projectId ? ['/api/projects', projectId, 'calendars'] : ['/api/calendars/global'],
    queryFn: projectId ? undefined : async () => {
      const response = await fetch('/api/calendars/global');
      if (!response.ok) throw new Error('Failed to fetch calendars');
      return response.json();
    }
  });

  // Fetch week patterns for selected calendar
  const { data: weekPatterns = [] } = useQuery<CalendarWeekPattern[]>({
    queryKey: selectedCalendar ? ['/api/calendars', selectedCalendar.id, 'week-patterns'] : [],
    enabled: !!selectedCalendar
  });

  // Fetch exceptions for selected calendar
  const { data: exceptions = [] } = useQuery<CalendarException[]>({
    queryKey: selectedCalendar ? ['/api/calendars', selectedCalendar.id, 'exceptions'] : [],
    enabled: !!selectedCalendar
  });

  // Fetch shifts
  const { data: shifts = [] } = useQuery<CalendarShift[]>({
    queryKey: projectId ? ['/api/projects', projectId, 'calendar-shifts'] : ['/api/calendar-shifts/global'],
    queryFn: projectId ? undefined : async () => {
      const response = await fetch('/api/calendar-shifts/global');
      if (!response.ok) throw new Error('Failed to fetch shifts');
      return response.json();
    }
  });

  // Create calendar mutation
  const createCalendarMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createCalendarSchema>) => {
      return apiRequest('/api/calendars', 'POST', { ...data, projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectId ? ['/api/projects', projectId, 'calendars'] : ['/api/calendars/global'] });
      setIsCalendarDialogOpen(false);
      toast({ title: "Success", description: "Calendar created successfully" });
      calendarForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create calendar", variant: "destructive" });
    }
  });

  // Create exception mutation
  const createExceptionMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createExceptionSchema>) => {
      if (!selectedCalendar) throw new Error('No calendar selected');
      return apiRequest(`/api/calendars/${selectedCalendar.id}/exceptions`, 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendars', selectedCalendar?.id, 'exceptions'] });
      setIsExceptionDialogOpen(false);
      toast({ title: "Success", description: "Exception added successfully" });
      exceptionForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add exception", variant: "destructive" });
    }
  });

  // Create shift mutation
  const createShiftMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createShiftSchema>) => {
      return apiRequest('/api/calendar-shifts', 'POST', { ...data, projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectId ? ['/api/projects', projectId, 'calendar-shifts'] : ['/api/calendar-shifts/global'] });
      setIsShiftDialogOpen(false);
      toast({ title: "Success", description: "Shift created successfully" });
      shiftForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create shift", variant: "destructive" });
    }
  });

  // Forms
  const calendarForm = useForm({
    resolver: zodResolver(createCalendarSchema),
    defaultValues: {
      name: "",
      type: "Project" as const,
      description: "",
      workDaysPerWeek: 5,
      workHoursPerDay: 8,
      isDefault: false
    }
  });

  const exceptionForm = useForm({
    resolver: zodResolver(createExceptionSchema),
    defaultValues: {
      exceptionDate: "",
      exceptionType: "Holiday" as const,
      name: "",
      isRecurring: false,
      startTime: "",
      endTime: ""
    }
  });

  const shiftForm = useForm({
    resolver: zodResolver(createShiftSchema),
    defaultValues: {
      name: "",
      code: "",
      startTime: "08:00",
      endTime: "17:00",
      breakStartTime: "12:00",
      breakEndTime: "13:00",
      workHours: 8
    }
  });

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  if (!calendarsLoading && calendars.length === 0) {
    // Empty state - matches the mockup
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="h-8 w-8" />
            Work Calendars
          </h1>
          <Dialog open={isCalendarDialogOpen} onOpenChange={setIsCalendarDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-new-calendar">
                <Plus className="h-4 w-4" />
                New Calendar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Calendar</DialogTitle>
                <DialogDescription>
                  Set up a new work calendar with custom schedules and holidays.
                </DialogDescription>
              </DialogHeader>
              <Form {...calendarForm}>
                <form onSubmit={calendarForm.handleSubmit((data) => createCalendarMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={calendarForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Calendar Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Standard 5-Day" {...field} data-testid="input-calendar-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={calendarForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Calendar Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-calendar-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Global">Global</SelectItem>
                            <SelectItem value="Project">Project</SelectItem>
                            <SelectItem value="Resource">Resource</SelectItem>
                            <SelectItem value="Activity">Activity</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={calendarForm.control}
                    name="workDaysPerWeek"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Days Per Week</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={7} {...field} onChange={e => field.onChange(parseInt(e.target.value))} data-testid="input-work-days" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={calendarForm.control}
                    name="workHoursPerDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Hours Per Day</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={24} {...field} onChange={e => field.onChange(parseInt(e.target.value))} data-testid="input-work-hours" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={calendarForm.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Set as Default</FormLabel>
                          <FormDescription>
                            Use this calendar as the project default
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-default-calendar"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createCalendarMutation.isPending} data-testid="button-create-calendar">
                      {createCalendarMutation.isPending ? "Creating..." : "Create Calendar"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="max-w-3xl mx-auto">
          <CardContent className="flex flex-col items-center py-16">
            <div className="rounded-full bg-muted p-6 mb-4">
              <CalendarIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Calendar Management</h2>
            <p className="text-muted-foreground text-center mb-6">
              Work calendar configuration coming soon
            </p>
            <div className="text-left space-y-2 text-sm text-muted-foreground">
              <p>Features will include:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Custom work schedules</li>
                <li>Holiday and exception management</li>
                <li>Multiple calendar assignments</li>
                <li>Resource-specific calendars</li>
                <li>Shift and non-working time</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CalendarDays className="h-8 w-8" />
          Work Calendars
        </h1>
        <div className="flex gap-2">
          <Dialog open={isShiftDialogOpen} onOpenChange={setIsShiftDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2" data-testid="button-new-shift">
                <Clock className="h-4 w-4" />
                New Shift
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Shift</DialogTitle>
                <DialogDescription>
                  Define a shift template for rotating schedules.
                </DialogDescription>
              </DialogHeader>
              <Form {...shiftForm}>
                <form onSubmit={shiftForm.handleSubmit((data) => createShiftMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={shiftForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shift Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Day Shift" {...field} data-testid="input-shift-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={shiftForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shift Code</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., DS" {...field} data-testid="input-shift-code" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={shiftForm.control}
                      name="startTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} data-testid="input-shift-start" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={shiftForm.control}
                      name="endTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} data-testid="input-shift-end" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createShiftMutation.isPending} data-testid="button-create-shift">
                      {createShiftMutation.isPending ? "Creating..." : "Create Shift"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isCalendarDialogOpen} onOpenChange={setIsCalendarDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-new-calendar">
                <Plus className="h-4 w-4" />
                New Calendar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Calendar</DialogTitle>
                <DialogDescription>
                  Set up a new work calendar with custom schedules and holidays.
                </DialogDescription>
              </DialogHeader>
              <Form {...calendarForm}>
                <form onSubmit={calendarForm.handleSubmit((data) => createCalendarMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={calendarForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Calendar Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Standard 5-Day" {...field} data-testid="input-calendar-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={calendarForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Calendar Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-calendar-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Global">Global</SelectItem>
                            <SelectItem value="Project">Project</SelectItem>
                            <SelectItem value="Resource">Resource</SelectItem>
                            <SelectItem value="Activity">Activity</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={calendarForm.control}
                    name="workDaysPerWeek"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Days Per Week</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={7} {...field} onChange={e => field.onChange(parseInt(e.target.value))} data-testid="input-work-days" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={calendarForm.control}
                    name="workHoursPerDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Hours Per Day</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={24} {...field} onChange={e => field.onChange(parseInt(e.target.value))} data-testid="input-work-hours" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createCalendarMutation.isPending} data-testid="button-create-calendar">
                      {createCalendarMutation.isPending ? "Creating..." : "Create Calendar"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {calendars.map(calendar => (
            <Card 
              key={calendar.id} 
              className={`cursor-pointer transition-colors ${selectedCalendar?.id === calendar.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedCalendar(calendar)}
              data-testid={`calendar-card-${calendar.id}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CalendarIco className="h-5 w-5" />
                    {calendar.name}
                  </span>
                  {calendar.isDefault && <Badge>Default</Badge>}
                </CardTitle>
                <CardDescription>
                  {calendar.type} Calendar • {calendar.workDaysPerWeek} day week • {calendar.workHoursPerDay} hrs/day
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        {selectedCalendar && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{selectedCalendar.name} Details</span>
                <div className="flex gap-2">
                  <Dialog open={isExceptionDialogOpen} onOpenChange={setIsExceptionDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2" data-testid="button-add-exception">
                        <AlertCircle className="h-4 w-4" />
                        Add Exception
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Calendar Exception</DialogTitle>
                        <DialogDescription>
                          Add holidays or special working hours for specific dates.
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...exceptionForm}>
                        <form onSubmit={exceptionForm.handleSubmit((data) => createExceptionMutation.mutate(data))} className="space-y-4">
                          <FormField
                            control={exceptionForm.control}
                            name="exceptionDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Date</FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} data-testid="input-exception-date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={exceptionForm.control}
                            name="exceptionType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Exception Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-exception-type">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="Holiday">Holiday</SelectItem>
                                    <SelectItem value="NonWorkingDay">Non-Working Day</SelectItem>
                                    <SelectItem value="ModifiedHours">Modified Hours</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={exceptionForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Name (Optional)</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., Christmas Day" {...field} data-testid="input-exception-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <Button type="submit" disabled={createExceptionMutation.isPending} data-testid="button-create-exception">
                              {createExceptionMutation.isPending ? "Adding..." : "Add Exception"}
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="week" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="week">Week Pattern</TabsTrigger>
                  <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
                  <TabsTrigger value="assignments">Assignments</TabsTrigger>
                </TabsList>
                
                <TabsContent value="week" className="space-y-4">
                  <div className="space-y-2">
                    {weekPatterns.map(pattern => (
                      <div key={pattern.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50" data-testid={`week-pattern-${pattern.dayOfWeek}`}>
                        <div className="flex items-center gap-3">
                          <Badge variant={pattern.isWorkingDay ? "default" : "secondary"}>
                            {dayNames[pattern.dayOfWeek]}
                          </Badge>
                          {pattern.isWorkingDay ? (
                            <span className="text-sm">
                              {pattern.startTime} - {pattern.endTime}
                              {pattern.breakStartTime && ` (Break: ${pattern.breakStartTime} - ${pattern.breakEndTime})`}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Non-working day</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="exceptions" className="space-y-4">
                  {exceptions.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No exceptions defined</p>
                  ) : (
                    <div className="space-y-2">
                      {exceptions.map(exception => (
                        <div key={exception.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50" data-testid={`exception-${exception.id}`}>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{exception.exceptionType}</Badge>
                            <span className="text-sm">
                              {exception.exceptionDate} - {exception.name || "Unnamed Exception"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="assignments" className="space-y-4">
                  <p className="text-muted-foreground text-center py-4">Calendar assignments will be shown here</p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {shifts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Shift Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {shifts.map(shift => (
                  <div key={shift.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50" data-testid={`shift-${shift.id}`}>
                    <div>
                      <p className="font-medium">{shift.name} {shift.code && `(${shift.code})`}</p>
                      <p className="text-sm text-muted-foreground">
                        {shift.startTime} - {shift.endTime} • {shift.workHours || 8} hrs
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}