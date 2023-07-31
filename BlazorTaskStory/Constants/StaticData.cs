using System.Diagnostics;

namespace StoicDreams.WebApp.Constants;

public class StaticData
{
	public StaticData(IStoicDreamsApi api, ISessionState sessionState, IClientAuth auth)
	{
		Api = api;
		SessionState = sessionState;
		Auth = auth;
		RunInitialLoading();
	}

	public const string AppName = "TaskStory";
	public string[] PlanAlerts = new[]
	{
		"Task Story is currently in Early Access",
		"Phase-1 features have been completed and we are currently going through additional testing to assure every aspect of Task Story is stable.",
		"We are also working heavily on adding and updating site documentation to cover how to use specific features in Task Story as well as blogs to share our knowledge of developing software.",
		"Our top priority is to make sure everyone using Task Story is having an issue-free experience, but if you do encounter any issues or something not working how you would expect, please use the Feedback tool at the top right of the page to let us know what issues you're having.",
		"We have many more great features planned for Phase-2, such as image and file management",
		"Thank you!"
	};

	private async void RunInitialLoading()
	{
		await GetSubscriptionStatus();
		await GetMyGroups();
		await LoadPlans();
		IsLoading = false;
		await SessionState.TriggerChangeAsync(StaticData.CurrentGroupIdKey);
	}

	public ApiDataTransfer GetDefaultPostData(string dataType, string childData = "") => new() { DataType = dataType, Data = ApiDataTransfer.Create(AppName, childData).ConvertToWebEncryptedString() };

	public const string CurrentGroupIdKey = "CurrentGroupId";

	public async ValueTask<SubscriptionStatus> GetSubscriptionStatus(bool reload = false)
	{
		if (!Auth.IsLoggedIn) return MySubscriptionStatus;
		if (SubStatusIsLoaded && !reload) return MySubscriptionStatus;
		TResult<SubscriptionStatus> tStatus = await Api.PostJsonAsync<SubscriptionStatus, ApiDataTransfer>("Subscription/My", GetDefaultPostData("Status", string.Empty));
		if (!tStatus.IsOkay) return MySubscriptionStatus;
		MySubscriptionStatus = tStatus.Result;
		SubStatusIsLoaded = true;
		return MySubscriptionStatus;
	}
	private bool SubStatusIsLoaded { get; set; }

	public async ValueTask<Group[]> GetMyGroups(bool reload = false)
	{
		if (!Auth.IsLoggedIn) return MyGroups;
		if (GroupsAreLoaded && !reload) return MyGroups;
		TResult<List<Group>> tStatus = await Api.PostJsonAsync<List<Group>, ApiDataTransfer>("Groups/My", GetDefaultPostData(AppName, string.Empty));
		if (!tStatus.IsOkay) return MyGroups;
		MyGroups = tStatus.Result.ToArray();
		GroupsAreLoaded = true;
		return MyGroups;
	}
	private bool GroupsAreLoaded { get; set; }

	public const string PanelQuoteClass = "pa-3";

	public async ValueTask<SubscriptionPlan[]> GetSubscriptions()
	{
		if (Subscriptions.Length > 0) { return Subscriptions; }
		await LoadPlans();
		return Subscriptions;
	}
	public Guid SubscriptionStatusId => MySubscriptionStatus.Id;

	public bool IsLoading { get; private set; } = true;

	private SubscriptionPlan[] Subscriptions { get; set; } = Array.Empty<SubscriptionPlan>();
	private Stopwatch SubscriptionsLastLoaded { get; init; } = new();
	
	private async Task LoadPlans()
	{
		if (Subscriptions.Count() > 0 && SubscriptionsLastLoaded.Elapsed.TotalMinutes < 10) { return; }
		TResult<SubscriptionPlan[]> tResult = await Api.PostJsonAsync<SubscriptionPlan[], ApiDataTransfer>("Subscription/Plans", GetDefaultPostData("SubscriptionPlan"));
		if (!tResult.IsOkay) { return; }
		SubscriptionsLastLoaded.Restart();
		Subscriptions = tResult.Result.ToArray();
	}

	private SubscriptionStatus MySubscriptionStatus { get; set; } = new();
	private Group[] MyGroups { get; set; } = new[] { new Group() { GroupId = Guid.Empty, Name = "Guest" } };

	private IStoicDreamsApi Api { get; }
	private ISessionState SessionState { get; }
	private IClientAuth Auth { get; }
}
