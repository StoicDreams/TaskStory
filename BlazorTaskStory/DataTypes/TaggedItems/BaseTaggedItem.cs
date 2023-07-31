namespace StoicDreams.WebApp.DataTypes.TaggedItems;

public class BaseTaggedItem
{
	public Guid Id { get; set; } = Guid.Empty;
	public string Name { get; set; } = string.Empty;
	public List<string> Tags { get; set; } = new();
	public int SortId { get; set; }
	public DateTime Created { get; set; } = DateTime.UtcNow;
	public DateTime Updated { get; set; } = DateTime.UtcNow;

	public virtual string GetTitle => Name;

	public virtual bool NeedsContent => false;

	public virtual string GetMarkdown => $@"
# {GetTitle}

## Base Details

| Name | Details |
| --- | --- |
| Name | {Name} |
| Owner | {GetOwner} |
| Tags | {string.Join(", ", Tags)} |
| Created | {Created:D} |
| Last Update | {Updated:D} |
".Trim();

	public void MergeTags(ICollection<string> tags)
	{
		foreach (string tag in tags)
		{
			if (Tags.Contains(tag)) { continue; }
			Tags.Add(tag);
		}
	}

	private string GetOwner => Tags.FirstOrDefault(x => x.StartsWith("person:")) ?? "None";

	public override string ToString()
	{
		return $"{SortId}_{Id}_{Name}_{string.Join('-', Tags)}";
	}
}
