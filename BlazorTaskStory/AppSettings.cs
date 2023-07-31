namespace StoicDreams.WebApp;

public static class AppSettings
{
	private const bool RunLocal = false;

	public static IServiceCollection WebStartup(this IServiceCollection services)
	{
		services.AddStoicDreamsBlazorUI(ApplyAppSettings);
		services.AddStoicDreamsAuth(options =>
		{
			options.AuthEncryptionPassword = "Trep Bomp Flang GurzEl Pqlzoe Eoxnq Apqnx";
			options.ApiEncryptionPassword = "";
			options.DrawerIconWhenLoggedIn = Icons.Material.TwoTone.AccountCircle;
			options.DrawerIconWhenLoggedOut = Icons.Material.TwoTone.Login;
			options.BaseURL = RunLocal ? "https://localhost:7227/" : "https://auth.myfi.ws/";
			options.SessionUrl = "SessionState";
			options.VerifySignedInUrl = "Login";
			options.SignInUrl = "Login";
			options.SignOutUrl = "Logout";
			options.SignUpUrl = "SignUp";
			options.UpdatePasswordUrl = "Password";
		});
		return services;
	}

	public static void ApplyAppSettings(IAppOptions options)
	{
		options.AppName = "Task Story";
		options.Domain = "TaskStory.com";
		options.CompanyName = "Stoic Dreams";
		options.CopyrightStart = 2016;
		options.CompanyHomeUrl = "https://www.stoicdreams.com";
		options.TitleBarPosition = TitleBarPosition.Top;
		options.LeftDrawerVariant = DrawerVariant.Mini;
		options.ApplyOnStartup<AppStartup>();
		options.ApplyStateOnStartup(appState =>
		{
			appState.SetData(AppStateDataTags.UsesStoicDreamsAuth, true);
			appState.SetData(AppStateDataTags.FeedbackComponent, typeof(FeedbackDialog));
			appState.SetData(AppStateDataTags.TitleBarLogo, "<img src=\"Logo.svg\" title=\"Task Story Logo\" aria-label=\"Task Story Logo\" />");
			appState.SetData(AppStateDataTags.NavList, GetSiteNavigation());
			appState.SetData(AppStateDataTags.RightDrawerOnClick, HandlerRightDrawerClickState);
			appState.SetData(AppStateDataTags.TitleBarRightDrawerIcon, Icons.Material.TwoTone.Login);
			//appState.SetData(AppStateDataTags.TitleBarRightDrawerTitle, "Sign-In");
			//appState.SetData(AppStateDataTags.TitleBarLeftDrawerTitle, "Toggle Navigation Menu");
			appState.SetData(AppStateDataTags.TitleBarRightSideContent, typeof(TitleBarStrip));
		});
	}

	private static List<NavDetail> GetSiteNavigation() => new()
	{
		NavDetail.Create("About", SVG.FontAwesome.DuoTone.House, "/agile-project-management", UserRoles.Guest),
		NavDetail.Create("Dashboard", SVG.FontAwesome.DuoTone.DiagramCells, "/dashboard", UserRoles.User),
		NavDetail.Create("Projects", SVG.FontAwesome.DuoTone.DiagramProject, "/projects", UserRoles.User),
		NavDetail.Create("Features", SVG.FontAwesome.DuoTone.HandHoldingMagic, "/features", UserRoles.User),
		NavDetail.Create("Problems", SVG.FontAwesome.DuoTone.TriangleExclamation, "/problems", UserRoles.User),
		NavDetail.Create("Solutions", SVG.FontAwesome.DuoTone.WandMagicSparkles, "/solutions", UserRoles.User),
		NavDetail.Create("Tasks", SVG.FontAwesome.DuoTone.DiagramSubtask, "/tasks", UserRoles.User),
		NavDetail.Create("Stories", SVG.FontAwesome.DuoTone.RectangleHistoryCircleUser, "/stories", UserRoles.User),
		NavDetail.CreateGroup("Docs", SVG.FontAwesome.DuoTone.FolderTree, UserRoles.Guest, new[]
		{
			NavDetail.Create("Workflow", SVG.FontAwesome.SharpSolid.DiagramNext, "/docs/workflows", UserRoles.Guest),
			NavDetail.Create("Dashboard", SVG.FontAwesome.SharpSolid.DiagramCells, "/docs/dashboard", UserRoles.Guest),
			NavDetail.Create("Projects", SVG.FontAwesome.SharpSolid.DiagramProject, "/docs/projects", UserRoles.Guest),
			NavDetail.Create("Features", SVG.FontAwesome.SharpSolid.HandHoldingMagic, "/docs/features", UserRoles.Guest),
			NavDetail.Create("Problems", SVG.FontAwesome.SharpSolid.TriangleExclamation, "/docs/problems", UserRoles.Guest),
			NavDetail.Create("Solutions", SVG.FontAwesome.SharpSolid.WandMagicSparkles, "/docs/solutions", UserRoles.Guest),
			NavDetail.Create("Tasks", SVG.FontAwesome.SharpSolid.DiagramSubtask, "/docs/tasks", UserRoles.Guest),
			NavDetail.Create("Stories", SVG.FontAwesome.SharpSolid.RectangleHistoryCircleUser, "/docs/stories", UserRoles.Guest),
		}),
		NavDetail.CreateGroup("Blogs", SVG.FontAwesome.DuoTone.Blog, UserRoles.Guest, new[]
		{
			NavDetail.Create("Blog Home", SVG.FontAwesome.SharpSolid.Blog, "/blogs", UserRoles.Guest),
		}),
		NavDetail.Create("My Subscription", SVG.FontAwesome.DuoTone.Ticket, "/account/subscription", UserRoles.User),
		NavDetail.Create("Pricing", SVG.FontAwesome.DuoTone.BallotCheck, "/pricing", UserRoles.Guest),
		NavDetail.Create("Terms", SVG.FontAwesome.DuoTone.Handshake, "/terms", UserRoles.Guest),
		NavDetail.Create("Privacy", SVG.FontAwesome.DuoTone.ShieldExclamation, "/privacy", UserRoles.Guest),
	};

	private static ValueTask HandlerRightDrawerClickState(BUICore sender, DrawerClickState clickState)
	{
		if (!sender.Auth.IsLoggedIn)
		{
			sender.NavManager.NavigateTo("/signin");
			sender.AppState.SetData(AppStateDataTags.TitleBarRightDrawerOpen, false);
			return ValueTask.CompletedTask;
		}
		if (clickState == DrawerClickState.Opening)
		{
			sender.AppState.SetData(AppStateDataTags.RightDrawerContent, typeof(AccountPortal));
		}
		return ValueTask.CompletedTask;
	}
}
