namespace StoicDreams.WebApp.DataTypes.TaggedItems;

public class TaskDetail : BaseTaggedItem
{
	public string Details { get; set; } = string.Empty;

	public override bool NeedsContent => string.IsNullOrWhiteSpace(Details);

	public override string GetMarkdown => $@"{base.GetMarkdown}

## Details

{Details}
".Trim();

	public override string ToString()
	{
		return $"{base.ToString()}_{Details.GetStaticHashCode()}";
	}
}
