namespace StoicDreams.WebApp.Data;

public class TagFilterService
{
	public TagFilterService(ISessionState sessionState, StaticData data)
	{
		SessionState = sessionState;
		Data = data;
		Tags = new(SyncTagUpdates);
		Teams = new(SyncTagUpdates);
		Projects = new(SyncTagUpdates);
		Problems = new(SyncTagUpdates);
		Solutions = new(SyncTagUpdates);
		Features = new(SyncTagUpdates);
		People = new(SyncTagUpdates);
		LoadTagFilterFromState();
	}

	public int TagMaxLength = 30;
	public ListWatcher<string> Tags { get; }
	public ListWatcher<string> Teams { get; }
	public ListWatcher<string> Projects { get; }
	public ListWatcher<string> Problems { get; }
	public ListWatcher<string> Solutions { get; }
	public ListWatcher<string> Features { get; }
	public ListWatcher<string> People { get; }

	public string NewValue { get; set; } = string.Empty;
	private Func<string, Task>? NewTagHandler { get; set; }
	public void SetNewTagHandler(Func<string, Task> handler)
	{
		NewTagHandler = handler;
	}

	public void NewTagUpdated(string tag)
	{
		NewValue = string.Empty;
		AddTag(tag);
	}
	public async ValueTask ApplyTag(string tag)
	{
		if (string.IsNullOrWhiteSpace(tag)) { return; }
		if (NewTagHandler == null) { return; }
		await NewTagHandler.Invoke(tag);
	}
	public async Task SearchValueChanged(string removePrefix, string value)
	{
		if (!string.IsNullOrWhiteSpace(removePrefix))
		{
			RemovePrefixTagFromTagFilter(removePrefix);
		}
		await ApplyTag(value);
	}

	/// <summary>
	/// Merges ListWatcher lists to Filter and saves Filter to session.
	/// If doing multiple tag updates, set IsSyncingMultipleTags to true during updates to skip each update triggering this process.
	/// Once complete, set IsSyncingMultipleTags to false and manually call this method.
	/// </summary>
	private void SyncTagUpdates()
	{
		if (IsSyncingMultipleTags)
		{
			SkippedUpdates = true;
			return;
		}
		SkippedUpdates = false;
		MergeListToList(Tags, Filter.Tags);
		MergeListToList(Teams, Filter.Teams);
		MergeListToList(Projects, Filter.Projects);
		MergeListToList(Problems, Filter.Problems);
		MergeListToList(Solutions, Filter.Solutions);
		MergeListToList(Features, Filter.Features);
		MergeListToList(People, Filter.People);
		_ = SetSessionStateWithTrigger(SessionNameTagFilter, Filter);
	}
	private bool SkippedUpdates { get; set; }

	private void MergeListToList(List<string> listFrom, List<string> listTo)
	{
		listTo.Clear();
		listTo.AddRange(listFrom);
	}

	private bool IsSyncingMultipleTags { get; set; }

	private async void LoadTagFilterFromState()
	{
		Filter = await GetSessionState(SessionNameTagFilter, () => new TagFilter());
		SyncingTagUpdates(() =>
		{
			MergeListToList(Filter.Tags, Tags);
			MergeListToList(Filter.Teams, Teams);
			MergeListToList(Filter.Projects, Projects);
			MergeListToList(Filter.Problems, Problems);
			MergeListToList(Filter.Solutions, Solutions);
			MergeListToList(Filter.Features, Features);
			MergeListToList(Filter.People, People);
		});
	}

	public void SyncingTagUpdates(Action updates)
	{
		IsSyncingMultipleTags = true;
		updates.Invoke();
		IsSyncingMultipleTags = false;
		if (!SkippedUpdates) return;
		SyncTagUpdates();
	}

	public void TriggerRefresh()
	{
		_ = SessionState.TriggerChangeAsync(StaticData.CurrentGroupIdKey);
	}

	public void SetTags(ICollection<string> tags)
	{
		string[] newTags = tags.ToArray();
		SyncingTagUpdates(() =>
		{
			Tags.Clear();
			Tags.AddRange(newTags);
		});
	}

	public void AddTag(string tag)
	{
		if (string.IsNullOrWhiteSpace(tag)) return;
		if (tag.Contains(':'))
		{
			string prefix = tag.Substring(0, tag.IndexOf(':'));
			RemovePrefixTagFromTagFilter(prefix);
		}
		else if (Tags.Contains(tag)) return;
		Tags.Add(tag);
		_ = ApplyTag(tag);
	}

	public void RemoveTag(string tag)
	{
		if (!Tags.Contains(tag)) { return; }
		Tags.Remove(tag);
	}

	public void ToggleTag(string tag)
	{
		if (Tags.Contains(tag))
		{
			RemoveTag(tag);
			return;
		}
		AddTag(tag);
	}

	public void RemovePrefixTagFromTagFilter(string prefix)
	{
		string[] tags = Tags.ToArray();
		SyncingTagUpdates(() =>
		{
			foreach (string tag in tags)
			{
				if (!tag.StartsWith(prefix)) { continue; }
				Tags.Remove(tag);
			}
		});
	}

	public void ApplyUsingTags(ICollection<string> tags)
	{
		SyncingTagUpdates(() =>
		{
			foreach (string tag in tags)
			{
				ApplyUsingTag(tag);
			}
		});
	}

	public void ApplyUsingTag(string tag)
	{
		if (IsType(tag, "team:", Teams)) return;
		if (IsType(tag, "project:", Projects)) return;
		if (IsType(tag, "problem:", Problems)) return;
		if (IsType(tag, "solution:", Solutions)) return;
		if (IsType(tag, "feature:", Features)) return;
		if (IsType(tag, "person:", People)) return;
	}

	private static bool IsType(string tag, string typePrefix, List<string> list)
	{
		if (!tag.StartsWith(typePrefix)) { return false; }
		if (!list.Contains(tag))
		{
			list.Add(tag);
		}
		return true;
	}

	public Color FilterChipColor(string tag)
	{
		if (tag.StartsWith("project:")) return Color.Primary;
		if (tag.StartsWith("team:")) return Color.Warning;
		if (tag.StartsWith("problem:")) return Color.Secondary;
		if (tag.StartsWith("solution:")) return Color.Tertiary;
		if (tag.StartsWith("feature:")) return Color.Info;
		if (tag.StartsWith("blocked")) return Color.Error;
		if (tag.StartsWith("bug")) return Color.Error;
		if (tag.StartsWith("person:")) return Color.Success;
		return Color.Default;
	}

	private async ValueTask<TItem> GetSessionState<TItem>(string key, Func<TItem> defaultHandler)
	{
		return (await SessionState.GetDataAsync<TItem>(key)) ?? defaultHandler.Invoke();
	}

	private async ValueTask SetSessionStateWithTrigger<TItem>(string key, TItem value)
	{
		await SessionState.SetDataAsync(key, value);
		TriggerRefresh();
	}

	private const string SessionNameTagFilter = "TagFilter";

	private StaticData Data { get; }
	private TagFilter Filter { get; set; } = new();
	private ISessionState SessionState { get; }
}
