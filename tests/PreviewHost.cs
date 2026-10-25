using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;
[StructLayout(LayoutKind.Sequential)] public struct PreviewRect { public int left,top,right,bottom; public PreviewRect(int w,int h){left=top=0;right=w;bottom=h;} }
[ComImport,Guid("8895b1c6-b41f-4c1c-a562-0d564250836f"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IPreview {
 [PreserveSig]int SetWindow(IntPtr parent,ref PreviewRect rect);[PreserveSig]int SetRect(ref PreviewRect rect);[PreserveSig]int DoPreview();[PreserveSig]int Unload();[PreserveSig]int SetFocus();[PreserveSig]int QueryFocus(out IntPtr window);[PreserveSig]int TranslateAccelerator(IntPtr message);
}
[ComImport,Guid("b7d14566-0509-4cce-a71f-0a554233bd9b"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IFileInit { [PreserveSig]int Initialize([MarshalAs(UnmanagedType.LPWStr)]string path,uint mode); }
[ComImport,Guid("b824b49d-22ac-4161-ac8a-9916e8fa3f7f"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IStreamInit { [PreserveSig]int Initialize(IStream stream,uint mode); }
[ComImport,Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IShellItem {
 [PreserveSig]int BindToHandler(IntPtr context,ref Guid handler,ref Guid id,out IntPtr result);
 [PreserveSig]int GetParent(out IShellItem parent);
 [PreserveSig]int GetDisplayName(uint display,out IntPtr name);
 [PreserveSig]int GetAttributes(uint mask,out uint attributes);
 [PreserveSig]int Compare(IShellItem item,uint hint,out int order);
}
[ComImport,Guid("7f73be3f-fb79-493c-a6c7-7ee14e245841"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IItemInit { [PreserveSig]int Initialize([MarshalAs(UnmanagedType.Interface)]IShellItem item,uint mode); }
public static class PreviewProbe {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=true)]public static extern int SHCreateItemFromParsingName(string path,IntPtr context,ref Guid id,[MarshalAs(UnmanagedType.Interface)]out IShellItem item);
 [DllImport("shlwapi.dll",CharSet=CharSet.Unicode)]public static extern int SHCreateStreamOnFileEx(string file,uint mode,uint attributes,bool create,IntPtr template,out IStream stream);
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr window,out PreviewRect rect);
 [DllImport("user32.dll")]public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr window);
 public static string[] Names(IntPtr window){var root=AutomationElement.FromHandle(window);return root.FindAll(TreeScope.Descendants,Condition.TrueCondition).Cast<AutomationElement>().Select(element=>element.Current.Name??"").ToArray();}
 public static void Capture(IntPtr window,string file){PreviewRect rect;GetWindowRect(window,out rect);using(var bitmap=new Bitmap(Math.Max(1,rect.right-rect.left),Math.Max(1,rect.bottom-rect.top))){using(var graphics=Graphics.FromImage(bitmap))graphics.CopyFromScreen(rect.left,rect.top,0,0,bitmap.Size);bitmap.Save(file,System.Drawing.Imaging.ImageFormat.Png);}}
 public static void Wait(IntPtr window,string expected,int seconds){var deadline=DateTime.UtcNow.AddSeconds(seconds);string[] names=new string[0];while(DateTime.UtcNow<deadline){Application.DoEvents();try{names=Names(window);if(names.Contains(expected))return;}catch(Exception){}Thread.Sleep(300);}throw new Exception("Rendered preview text missing: "+expected+"; tree="+String.Join(" | ",names.Take(100)));}
 public static void CheckImage(IntPtr window,string name){
  var images=AutomationElement.FromHandle(window).FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Image)).Cast<AutomationElement>();
  var image=images.FirstOrDefault(element=>element.Current.Name==name);if(image==null)throw new Exception("Rendered image missing: "+name);
  var rect=image.Current.BoundingRectangle;if(rect.Width<200||rect.Height<70)throw new Exception("Image failed to decode: "+name);
  using(var bitmap=new Bitmap(1,1)){using(var graphics=Graphics.FromImage(bitmap))graphics.CopyFromScreen((int)(rect.Left+rect.Width*0.8),(int)(rect.Top+rect.Height*0.5),0,0,bitmap.Size);var color=bitmap.GetPixel(0,0);if(Math.Abs(color.R-70)>8||Math.Abs(color.G-130)>8||Math.Abs(color.B-180)>8)throw new Exception("Relative image pixels are wrong: "+name+" "+color);}
 }
 public static void Image(IntPtr window,string name){var until=DateTime.UtcNow.AddSeconds(15);Exception last=null;while(DateTime.UtcNow<until){Application.DoEvents();try{CheckImage(window,name);return;}catch(Exception error){last=error;}Thread.Sleep(150);}throw last??new Exception("Image unavailable: "+name);}
 public static void End(IntPtr window){
  var documents=AutomationElement.FromHandle(window).FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Document)).Cast<AutomationElement>();
  var document=documents.LastOrDefault();if(document==null)throw new Exception("Preview document not found");document.SetFocus();SendKeys.SendWait("^{END}");Wait(window,"Complete preview tail",45);
 }
 [STAThread]public static int Main(string[] args){
  try{
   SetProcessDPIAware();var area=Screen.PrimaryScreen.WorkingArea;
   var evidence=args[0]=="everything"?args[2]:args[0];
   var watchdog=new Thread(()=>{Thread.Sleep(150000);try{var bounds=Screen.PrimaryScreen.Bounds;using(var bitmap=new Bitmap(bounds.Width,bounds.Height)){using(var graphics=Graphics.FromImage(bitmap))graphics.CopyFromScreen(bounds.Left,bounds.Top,0,0,bitmap.Size);bitmap.Save(Path.Combine(evidence,"preview-watchdog.png"),System.Drawing.Imaging.ImageFormat.Png);}}catch(Exception){}Console.Error.WriteLine("FAIL: preview probe exceeded 150 seconds; captured desktop for diagnosis");Environment.Exit(2);});watchdog.IsBackground=true;watchdog.Start();
   if(args[0]=="everything"){
    var executable=args[1];var directory=args[2];var first=args[3];var second=args[4];
    var ini=Path.Combine(directory,"Everything.ini");var list=Path.Combine(directory,"Markdown.efu");
    File.WriteAllText(ini,"[Everything]\r\napp_data=0\r\nrun_as_admin=0\r\nshow_service_not_installed=0\r\nauto_include_fixed_volumes=0\r\nauto_include_removable_volumes=0\r\npreview_visible=1\r\npreview_x=650\r\nshow_preview_handlers_in_preview_pane=1\r\nwindow_wide="+Math.Min(1280,area.Width)+"\r\nwindow_high="+Math.Min(850,area.Height)+"\r\n");
    File.WriteAllText(list,"\"Filename\",\"Size\",\"Date Modified\",\"Date Created\",\"Attributes\"\r\n"+String.Join("\r\n",new[]{first,second}.Select(file=>"\""+file.Replace("\"","\"\"")+"\","+new FileInfo(file).Length+",0,0,0"))+"\r\n",new System.Text.UTF8Encoding(true));
    var process=Process.Start(new ProcessStartInfo(executable,"-instance OpenTyporaQA -config \""+ini+"\" -filelist \""+list+"\" -select \""+first+"\""){UseShellExecute=false});
    try{
     var deadline=DateTime.UtcNow.AddSeconds(30);IntPtr window=IntPtr.Zero;
     while(DateTime.UtcNow<deadline){process.Refresh();window=process.MainWindowHandle;if(window!=IntPtr.Zero)break;Thread.Sleep(300);}if(window==IntPtr.Zero)throw new Exception("Everything window not found");
     SetWindowPos(window,IntPtr.Zero,area.Left,area.Top,Math.Min(1280,area.Width),Math.Min(850,area.Height),4);Console.WriteLine("PROBE: actual Everything window opened");SetForegroundWindow(window);Wait(window,"Native preview one",75);Wait(window,"Local diagram",30);Image(window,"Local diagram");Capture(window,Path.Combine(directory,"everything-first.png"));
     Console.WriteLine("PROBE: Everything local image passed, scroll to full tail");End(window);Capture(window,Path.Combine(directory,"everything-full-tail.png"));Image(window,"Tail diagram");Capture(window,Path.Combine(directory,"everything-full-tail.png"));
     var select=Process.Start(new ProcessStartInfo(executable,"-instance OpenTyporaQA -select \""+second+"\""){UseShellExecute=false});select.WaitForExit(10000);
     Wait(window,"Native preview two",60);Capture(window,Path.Combine(directory,"everything-second.png"));
     File.WriteAllLines(Path.Combine(directory,"everything-accessibility.txt"),Names(window));Console.WriteLine("PASS: actual Everything 1.4 preview pane rendered both selected Markdown files through the registered handler.");
    }finally{var quit=Process.Start(new ProcessStartInfo(executable,"-instance OpenTyporaQA -exit"){UseShellExecute=false});quit.WaitForExit(10000);process.WaitForExit(10000);}
    return 0;
   }
   var output=args[0];var files=new[]{args[1],args[2]};var expected=new[]{"Native preview one","Native preview two"};
   Application.EnableVisualStyles();var form=new Form{Text="Open Typora native preview acceptance",Width=Math.Min(1050,area.Width),Height=Math.Min(800,area.Height),StartPosition=FormStartPosition.Manual,Location=area.Location};
   object instance=null;IPreview preview=null;IStream stream=null;int phase=0;var started=DateTime.UtcNow;
   var timer=new System.Windows.Forms.Timer{Interval=350};Exception failure=null;
   Action initialize=()=>{Console.WriteLine("PROBE: initialize native phase "+phase);var bounds=new PreviewRect(form.ClientSize.Width,form.ClientSize.Height);Marshal.ThrowExceptionForHR(preview.SetWindow(form.Handle,ref bounds));if(phase==0)Marshal.ThrowExceptionForHR(((IFileInit)instance).Initialize(files[phase],0));else{IShellItem item;var iid=new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(files[phase],IntPtr.Zero,ref iid,out item));try{Marshal.ThrowExceptionForHR(((IItemInit)instance).Initialize(item,0));}finally{Marshal.ReleaseComObject(item);}}Marshal.ThrowExceptionForHR(preview.DoPreview());started=DateTime.UtcNow;};
   form.Shown+=(sender,eventArgs)=>{try{instance=Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("726747EB-6A31-4BF2-898F-11620814C1F2")));preview=(IPreview)instance;initialize();timer.Start();}catch(Exception error){failure=error;form.Close();}};
   form.Resize+=(sender,eventArgs)=>{if(preview!=null){var bounds=new PreviewRect(form.ClientSize.Width,form.ClientSize.Height);preview.SetRect(ref bounds);}};
   timer.Tick+=(sender,eventArgs)=>{timer.Stop();try{
    string[] names;
    // WebView replaces its UIA subtree during file/item reinitialization.
    // Reacquire it on the next tick, within the existing render deadline.
    try{names=Names(form.Handle);}catch(ElementNotAvailableException){names=new string[0];}
    if(!names.Contains(expected[phase])){if((DateTime.UtcNow-started).TotalSeconds>75)throw new Exception("Native COM preview did not render: "+String.Join(" | ",names.Take(80)));return;}
    if(!names.Contains("Alpha"))throw new Exception("Markdown table cell missing from rendered accessibility tree");
    if(phase==0){Console.WriteLine("PROBE: native heading rendered, check local image");Image(form.Handle,"Local diagram");Console.WriteLine("PROBE: native image pixels passed, scroll to full tail");End(form.Handle);Console.WriteLine("PROBE: native full tail rendered, check tail image");Image(form.Handle,"Tail diagram");Capture(form.Handle,Path.Combine(output,"native-full-tail.png"));}
    Capture(form.Handle,Path.Combine(output,phase==0?"native-file.png":"native-item.png"));File.WriteAllLines(Path.Combine(output,"native-tree-"+phase+".txt"),names);
    Marshal.ThrowExceptionForHR(preview.SetFocus());IntPtr focus;Marshal.ThrowExceptionForHR(preview.QueryFocus(out focus));if(focus==IntPtr.Zero)throw new Exception("Preview focus was not set");
    preview.Unload();if(stream!=null){Marshal.ReleaseComObject(stream);stream=null;}
    if(phase++==0){form.Width=Math.Min(820,area.Width);initialize();}else{timer.Stop();form.Close();}
   }catch(Exception error){failure=error;timer.Stop();Capture(form.Handle,Path.Combine(output,"native-failure.png"));form.Close();}finally{if(!form.IsDisposed&&!form.Disposing&&form.Visible)timer.Start();}};
   Application.Run(form);timer.Dispose();if(preview!=null)preview.Unload();if(instance!=null)Marshal.FinalReleaseComObject(instance);if(failure!=null)throw failure;
   Console.WriteLine("PASS: registered native COM file/item initialization, rich Markdown rendering, resize, focus and unload.");return 0;
  }catch(Exception error){Console.Error.WriteLine(error);return 1;}
 }
}
